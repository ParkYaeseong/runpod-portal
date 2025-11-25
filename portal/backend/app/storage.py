from __future__ import annotations

import base64
import tarfile
from pathlib import Path
from typing import Iterable

from fastapi import UploadFile

from .config import get_settings

settings = get_settings()


def storage_path(*segments: str) -> Path:
    path = settings.storage_root.joinpath(*segments)
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def uploads_dir(user_id: int, job_id: str) -> Path:
    path = settings.storage_root / settings.uploads_dir / str(user_id) / job_id
    path.mkdir(parents=True, exist_ok=True)
    return path


def results_dir(user_id: int, job_id: str) -> Path:
    path = settings.storage_root / settings.results_dir / str(user_id) / job_id
    path.mkdir(parents=True, exist_ok=True)
    return path


def save_uploads(user_id: int, job_id: str, files: Iterable[UploadFile]) -> list[Path]:
    saved_paths: list[Path] = []
    target_dir = uploads_dir(user_id, job_id)
    for upload in files:
        target_path = target_dir / upload.filename
        with target_path.open("wb") as buffer:
            buffer.write(upload.file.read())
        saved_paths.append(target_path)
    return saved_paths


def build_archive(paths: list[Path], archive_path: Path) -> Path:
    archive_path.parent.mkdir(parents=True, exist_ok=True)
    with tarfile.open(archive_path, "w:gz") as tar:
        for path in paths:
            tar.add(path, arcname=path.name)
    return archive_path


def archive_to_base64(path: Path) -> str:
    data = path.read_bytes()
    return base64.b64encode(data).decode("ascii")


def remove_tree(path: Path) -> None:
    if not path.exists():
        return
    if path.is_file():
        path.unlink()
        return
    for child in path.iterdir():
        remove_tree(child)
    path.rmdir()

