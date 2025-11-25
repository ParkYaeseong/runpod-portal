from __future__ import annotations

import base64
import io
import tarfile
import threading
import time
from datetime import datetime
from pathlib import Path
from typing import Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models
from .config import get_settings
from .database import SessionLocal
from .runpod import RunpodClient
from .storage import remove_tree, results_dir

settings = get_settings()


class JobMonitor:
    def __init__(self) -> None:
        self._stop = threading.Event()
        self.thread = threading.Thread(target=self._run, name="job-monitor", daemon=True)
        self.client: RunpodClient | None = None

    def start(self) -> None:
        if not self.thread.is_alive():
            self.thread.start()

    def stop(self) -> None:
        self._stop.set()
        self.thread.join(timeout=5)

    def _run(self) -> None:
        try:
            self.client = RunpodClient()
        except RuntimeError as exc:
            print(f"[monitor] RunPod client disabled: {exc}")
            return
        while not self._stop.is_set():
            try:
                self._poll_once()
            except Exception as exc:  # noqa: BLE001
                print(f"[monitor] error: {exc}")
            finally:
                self._stop.wait(settings.poll_interval_seconds)

    def _poll_once(self) -> None:
        with SessionLocal() as db:
            jobs: Iterable[models.Job] = db.execute(
                select(models.Job).where(models.Job.status.in_(["submitted", "running", "queued", "pending"]))
            ).scalars()
            for job in jobs:
                self._update_job(db, job)
            self._cleanup_expired(db)
            db.commit()

    def _update_job(self, db: Session, job: models.Job) -> None:
        if not self.client or not job.endpoint_id or not job.runpod_job_id:
            return
        response = self.client.status(job.endpoint_id, job.runpod_job_id)
        status = response.get("status") or response.get("state")
        if status:
            job.status = status.lower()
        output = response.get("output") or {}
        if status == "COMPLETED" and output:
            self._persist_output(db, job, output)
        elif status in {"FAILED", "TIMED_OUT", "CANCELLED", "COMPLETED_WITH_ERRORS"}:
            job.error_message = response.get("error") or response.get("message")

    def _persist_output(self, db: Session, job: models.Job, output: dict) -> None:
        target_dir = results_dir(job.user_id, job.id)
        job.result_dir = str(target_dir)
        archives = output.get("archives") or []
        if not archives:
            archive_b64 = output.get("archive_base64")
            if archive_b64:
                archives = [{"name": f"{job.id}.tar.gz", "base64": archive_b64}]
        for item in archives:
            base64_data = item.get("base64")
            if not base64_data:
                continue
            file_name = item.get("name") or f"{job.id}.tar.gz"
            raw = base64.b64decode(base64_data)
            archive_path = target_dir / file_name
            archive_path.write_bytes(raw)
            job.result_archive = str(archive_path)
            try:
                with tarfile.open(fileobj=io.BytesIO(raw)) as tar:
                    tar.extractall(target_dir)
            except tarfile.ReadError:
                pass
            artifact = models.Artifact(
                job_id=job.id,
                file_name=file_name,
                file_path=str(archive_path),
                kind="archive",
                mime_type="application/gzip",
                size_bytes=len(raw),
            )
            db.add(artifact)
        self._index_results(db, job, target_dir)

    def _index_results(self, db: Session, job: models.Job, directory: Path) -> None:
        if not directory.exists():
            return
        existing_paths = {
            artifact.file_path
            for artifact in db.query(models.Artifact).filter(models.Artifact.job_id == job.id).all()
        }
        for file in directory.rglob("*"):
            if not file.is_file():
                continue
            if str(file) in existing_paths:
                continue
            suffix = file.suffix.lower()
            kind = "generic"
            mime = "application/octet-stream"
            if suffix in {".pdb", ".cif"}:
                kind = "structure"
                mime = "chemical/x-pdb" if suffix == ".pdb" else "chemical/x-cif"
            elif suffix in {".json", ".csv"}:
                kind = "table"
                mime = "application/json" if suffix == ".json" else "text/csv"
            elif suffix in {".html"}:
                kind = "html"
                mime = "text/html"
            artifact = models.Artifact(
                job_id=job.id,
                file_name=file.name,
                file_path=str(file),
                kind=kind,
                mime_type=mime,
                size_bytes=file.stat().st_size,
            )
            db.add(artifact)

    def _cleanup_expired(self, db: Session) -> None:
        now = datetime.utcnow()
        expired_jobs = db.scalars(select(models.Job).where(models.Job.expires_at < now)).all()
        for job in expired_jobs:
            if job.result_dir:
                remove_tree(Path(job.result_dir))
            uploads_folder = Path(job.input_archive_path).parent if job.input_archive_path else None
            if uploads_folder and uploads_folder.exists():
                remove_tree(uploads_folder)
            db.delete(job)


monitor = JobMonitor()

