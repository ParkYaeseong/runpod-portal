from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict

import httpx

from .config import get_settings

RUNPOD_BASE = "https://api.runpod.ai/v2"
settings = get_settings()


@dataclass
class InputField:
    name: str
    label: str
    field_type: str
    required: bool = False
    options: list[dict[str, str]] | None = None
    placeholder: str | None = None
    helper: str | None = None


@dataclass
class PipelineDefinition:
    key: str
    label: str
    description: str
    endpoint_attr: str
    instructions: str
    input_fields: list[InputField] = field(default_factory=list)
    supports_sequence: bool = False
    requires_archive: bool = False
    preview_kind: str = "generic"


PIPELINES: dict[str, PipelineDefinition] = {
    "alphafold": PipelineDefinition(
        key="alphafold",
        label="AlphaFold2",
        description="Predict protein structures and preview them in 3D.",
        endpoint_attr="alphafold_endpoint_id",
        instructions="Provide a FASTA file/folder or paste the raw sequence.",
        input_fields=[
            InputField(
                name="model_preset",
                label="Model preset",
                field_type="select",
                required=True,
                options=[{"value": "monomer", "label": "Monomer"}, {"value": "multimer", "label": "Multimer"}],
                helper="Batch submissions must use a single preset.",
            ),
            InputField(
                name="db_preset",
                label="DB preset",
                field_type="select",
                required=True,
                options=[{"value": "full_dbs", "label": "Full"}, {"value": "reduced_dbs", "label": "Reduced"}],
            ),
            InputField(
                name="max_template_date",
                label="Max template date",
                field_type="date",
                required=True,
                placeholder="2023-09-01",
            ),
        ],
        supports_sequence=True,
        preview_kind="protein",
    ),
    "diffdock": PipelineDefinition(
        key="diffdock",
        label="DiffDock",
        description="Run ligand docking jobs and download the ranked poses.",
        endpoint_attr="diffdock_endpoint_id",
        instructions="Upload protein PDBs and ligand files (single sdf or zipped folder).",
        input_fields=[
            InputField(
                name="num_samples",
                label="Sample count",
                field_type="number",
                required=True,
                placeholder="32",
                helper="Higher numbers take longer but improve coverage.",
            ),
            InputField(
                name="seed",
                label="Random seed",
                field_type="number",
                required=False,
                placeholder="42",
            ),
        ],
        requires_archive=True,
        preview_kind="ligand",
    ),
    "phastest": PipelineDefinition(
        key="phastest",
        label="PHASTEST",
        description="Generate phage functional reports mirroring the current notebook workflow.",
        endpoint_attr="phastest_endpoint_id",
        instructions="Upload the genome FASTA or CSV bundle exported from the helper notebook.",
        input_fields=[
            InputField(
                name="report_locale",
                label="Report language",
                field_type="select",
                required=True,
                options=[{"value": "ko", "label": "Korean"}, {"value": "en", "label": "English"}],
            ),
        ],
        requires_archive=True,
        preview_kind="phage",
    ),
}


class RunpodClient:
    def __init__(self) -> None:
        if not settings.runpod_api_key:
            raise RuntimeError("RUNPOD_API_KEY is required.")
        self.http = httpx.Client(timeout=60)
        self.api_key = settings.runpod_api_key

    def submit(self, endpoint_id: str, payload: Dict[str, Any]) -> str:
        url = f"{RUNPOD_BASE}/{endpoint_id}/run"
        headers = {"Authorization": f"Bearer {self.api_key}"}
        response = self.http.post(url, headers=headers, json={"input": payload})
        response.raise_for_status()
        data = response.json()
        return data.get("id") or data.get("jobId")

    def status(self, endpoint_id: str, job_id: str) -> Dict[str, Any]:
        url = f"{RUNPOD_BASE}/{endpoint_id}/status/{job_id}"
        headers = {"Authorization": f"Bearer {self.api_key}"}
        response = self.http.get(url, headers=headers)
        response.raise_for_status()
        return response.json()


def pipeline_endpoint(key: str) -> str:
    pipeline = PIPELINES[key]
    endpoint_id = getattr(settings, pipeline.endpoint_attr)
    if not endpoint_id:
        raise RuntimeError(f"{pipeline.label} endpoint is not configured ({pipeline.endpoint_attr}).")
    return endpoint_id


def build_pipeline_payload(key: str, parameters: Dict[str, Any], sequence: str | None = None, input_archive: dict | None = None) -> Dict[str, Any]:
    payload: Dict[str, Any] = {"pipeline": key, "parameters": parameters}
    if sequence:
        payload["sequence"] = sequence
    if input_archive:
        payload["input_archive"] = input_archive
    return payload

