from __future__ import annotations

import json
from pathlib import Path
from typing import List

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from .. import models
from ..auth import get_current_user
from ..database import get_db
from ..runpod import PIPELINES, RunpodClient, build_pipeline_payload, pipeline_endpoint
from ..schemas import JobRead
from ..storage import archive_to_base64, build_archive, remove_tree, save_uploads

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


@router.get("", response_model=List[JobRead])
def list_jobs(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    jobs = (
        db.query(models.Job)
        .filter(models.Job.user_id == current_user.id)
        .order_by(models.Job.created_at.desc())
        .all()
    )
    return jobs


@router.get("/{job_id}", response_model=JobRead)
def get_job(job_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    job = _get_job_or_404(db, current_user.id, job_id)
    return job


@router.post("", response_model=JobRead)
async def create_job(
    title: str = Form(...),
    pipeline: str = Form(...),
    parameters: str = Form("{}"),
    notes: str | None = Form(None),
    preferred_download_dir: str | None = Form(None),
    sequence: str | None = Form(None),
    files: list[UploadFile] | None = File(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if pipeline not in PIPELINES:
        raise HTTPException(status_code=400, detail="Unknown pipeline.")
    try:
        parameter_data = json.loads(parameters or "{}")
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Invalid parameter payload.") from exc

    job = models.Job(
        title=title,
        pipeline=pipeline,
        notes=notes,
        preferred_download_dir=preferred_download_dir,
        parameters=parameter_data,
        user_id=current_user.id,
        status="pending",
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    archive_payload = None
    if files:
        saved_files = save_uploads(current_user.id, job.id, files)
        archive_path = Path(saved_files[0]).parent / "inputs.tar.gz"
        build_archive(saved_files, archive_path)
        archive_payload = {
            "kind": "uploaded",
            "archive_name": "inputs.tar.gz",
            "file_names": [path.name for path in saved_files],
            "base64": archive_to_base64(archive_path),
        }
        job.input_archive_path = str(archive_path)

    pipeline_meta = PIPELINES[pipeline]
    if pipeline_meta.requires_archive and not archive_payload:
        raise HTTPException(status_code=400, detail="This pipeline requires file uploads.")

    endpoint_id = pipeline_endpoint(pipeline)
    job.endpoint_id = endpoint_id

    payload = build_pipeline_payload(
        pipeline,
        parameters=parameter_data,
        sequence=sequence if pipeline_meta.supports_sequence else None,
        input_archive=archive_payload,
    )

    try:
        client = RunpodClient()
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    runpod_job_id = client.submit(endpoint_id, payload)
    job.runpod_job_id = runpod_job_id
    job.status = "submitted"
    db.add(job)
    db.commit()
    db.refresh(job)

    return job


@router.get("/{job_id}/download")
def download_archive(job_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    job = _get_job_or_404(db, current_user.id, job_id)
    if not job.result_archive:
        raise HTTPException(status_code=404, detail="Results are not ready yet.")
    return FileResponse(job.result_archive, filename=Path(job.result_archive).name)


@router.delete("/{job_id}")
def delete_job(job_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    job = _get_job_or_404(db, current_user.id, job_id)
    if job.result_dir:
        remove_tree(Path(job.result_dir))
    if job.input_archive_path:
        archive_path = Path(job.input_archive_path)
        if archive_path.exists():
            remove_tree(archive_path)
        uploads_dir = archive_path.parent
        if uploads_dir.exists():
            remove_tree(uploads_dir)
    db.delete(job)
    db.commit()
    return {"ok": True}


@router.get("/{job_id}/artifacts/{artifact_id}")
def download_artifact(
    job_id: str,
    artifact_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_job_or_404(db, current_user.id, job_id)
    artifact = db.query(models.Artifact).filter(models.Artifact.id == artifact_id, models.Artifact.job_id == job_id).first()
    if not artifact:
        raise HTTPException(status_code=404, detail="Artifact not found.")
    return FileResponse(artifact.file_path, filename=artifact.file_name, media_type=artifact.mime_type or "application/octet-stream")


def _get_job_or_404(db: Session, user_id: int, job_id: str) -> models.Job:
    job = (
        db.query(models.Job)
        .filter(models.Job.id == job_id, models.Job.user_id == user_id)
        .first()
    )
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    return job

