from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class AttemptedStep(BaseModel):
    model_config = ConfigDict(extra="forbid")

    step: str
    expected: str
    reported: str
    match: bool


class Hypothesis(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    diagnostic_step: str
    expected_result: str
    if_confirmed: str
    if_ruled_out: str


class HandoffReport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    session_id: str
    equipment_type: str
    full_history: list[AttemptedStep] = Field(default_factory=list)
    ruled_out: list[str] = Field(default_factory=list)
    leading_hypothesis: str
    confidence: float = Field(ge=0.0, le=1.0)
    safety_flag: bool = False
    timestamp: datetime


class CandidateFix(BaseModel):
    model_config = ConfigDict(extra="forbid")

    fault_summary: str
    proposed_fix: str
    diagnostic_step: str
    expected_result: str
    sources: list[str] = Field(default_factory=list)
    equipment_type: str = ""
    symptoms: list[str] = Field(default_factory=list)
    safety_flags: list[str] = Field(default_factory=list)


class ValidatedFix(BaseModel):
    model_config = ConfigDict(extra="forbid")

    candidate: CandidateFix
    corroborating_sources: list[str] = Field(default_factory=list)
    confidence: float = Field(ge=0.0, le=1.0, default=0.0)
    notes: str = ""


class FaultTreeEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    fault_id: str
    symptoms: list[str]
    hypotheses: list[Hypothesis]
    safety_flags: list[str] = Field(default_factory=list)
    illustration_path: str | None = None
    video_path: str | None = None
    source_session_id: str | None = None
    created_at: datetime | None = None


class SyncResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    accepted: int
    distilled: int
    rejected: int
    entries: list[FaultTreeEntry]


class HealthResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["ok"] = "ok"


class TrainingData(BaseModel):
    model_config = ConfigDict(extra="forbid")

    query: str
    equipment_type: str


class TrainingResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: str
    new_entries_generated: int
    data: list[FaultTreeEntry]


class TrainingLog(BaseModel):
    model_config = ConfigDict(extra="forbid")

    log_id: str
    timestamp: datetime
    endpoint: str
    model_used: str
    prompt: str
    raw_response: str
    error: str | None = None
