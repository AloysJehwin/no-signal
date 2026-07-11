from __future__ import annotations

from datetime import datetime, timezone

import pytest

from cloud.agents import pipeline as pipeline_mod
from cloud.agents.distillation.agent import DistillationAgent
from cloud.agents.research.agent import ResearchAgent
from cloud.agents.validation.agent import ValidationAgent
from cloud.schemas import (
    AttemptedStep,
    CandidateFix,
    FaultTreeEntry,
    HandoffReport,
    Hypothesis,
    ValidatedFix,
)


def _report() -> HandoffReport:
    return HandoffReport(
        session_id="sess-happy-001",
        equipment_type="diesel_genset",
        full_history=[
            AttemptedStep(
                step="measure battery voltage",
                expected=">12V",
                reported="11.1V",
                match=False,
            )
        ],
        ruled_out=["fuel_starvation"],
        leading_hypothesis="starter_motor_failure",
        confidence=0.35,
        safety_flag=False,
        timestamp=datetime(2026, 7, 11, 10, 0, tzinfo=timezone.utc),
    )


def _candidate() -> CandidateFix:
    return CandidateFix(
        fault_summary="diesel_genset: starter_motor_failure",
        proposed_fix="replace starter solenoid; bench-test motor draws >200A stalled",
        diagnostic_step="bench-test the starter motor",
        expected_result="motor draws within spec",
        sources=["https://example.com/manual"],
        equipment_type="diesel_genset",
        symptoms=["won't crank"],
    )


def _entry() -> FaultTreeEntry:
    return FaultTreeEntry(
        fault_id="genset_starter_001",
        symptoms=["won't crank"],
        hypotheses=[
            Hypothesis(
                name="starter_motor_failure",
                diagnostic_step="bench-test starter",
                expected_result="within spec",
                if_confirmed="replace starter",
                if_ruled_out="check wiring harness",
            )
        ],
        source_session_id="sess-happy-001",
    )


@pytest.mark.asyncio
async def test_happy_path_yields_fault_tree_entry(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_investigate(self: ResearchAgent, report: HandoffReport) -> CandidateFix:
        return _candidate()

    async def fake_validate(self: ValidationAgent, c: CandidateFix) -> ValidatedFix | None:
        return ValidatedFix(candidate=c, corroborating_sources=c.sources, confidence=0.9)

    async def fake_distill(
        self: DistillationAgent, fix: ValidatedFix, report: HandoffReport
    ) -> FaultTreeEntry:
        return _entry()

    monkeypatch.setattr(ResearchAgent, "investigate", fake_investigate)
    monkeypatch.setattr(ValidationAgent, "validate", fake_validate)
    monkeypatch.setattr(DistillationAgent, "distill", fake_distill)

    entry = await pipeline_mod.run_pipeline(_report())
    assert entry is not None
    assert entry.fault_id == "genset_starter_001"


@pytest.mark.asyncio
async def test_validation_rejection_short_circuits_distillation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    distill_calls: list[str] = []

    async def fake_investigate(self: ResearchAgent, report: HandoffReport) -> CandidateFix:
        return _candidate()

    async def fake_validate(self: ValidationAgent, c: CandidateFix) -> ValidatedFix | None:
        return None

    async def fake_distill(
        self: DistillationAgent, fix: ValidatedFix, report: HandoffReport
    ) -> FaultTreeEntry:
        distill_calls.append(report.session_id)
        return _entry()

    monkeypatch.setattr(ResearchAgent, "investigate", fake_investigate)
    monkeypatch.setattr(ValidationAgent, "validate", fake_validate)
    monkeypatch.setattr(DistillationAgent, "distill", fake_distill)

    entry = await pipeline_mod.run_pipeline(_report())

    assert entry is None
    # WHY: this is the load-bearing assertion — unvalidated content must never
    # reach distillation or the fleet knowledge store.
    assert distill_calls == []
