import type {HandoffReport} from './HandoffReport';
import type {FaultTreeEntry, FaultTreeHypothesis} from '../rag/FaultTreeEntry';
import type {AttemptedStep} from '../state/AttemptedStep';

// The cloud API uses snake_case per Pydantic + `extra="forbid"`. Our mobile
// codebase uses camelCase. These converters bridge the two at the network
// boundary so internal types can stay clean.

// Wire shapes matching cloud/schemas.py exactly.
interface WireHypothesis {
  name: string;
  diagnostic_step: string;
  expected_result: string;
  if_confirmed: string;
  if_ruled_out: string;
}

interface WireAttemptedStep {
  step: string;
  expected: string;
  reported: string;
  match: boolean;
}

interface WireHandoffReport {
  session_id: string;
  equipment_type: string;
  full_history: WireAttemptedStep[];
  ruled_out: string[];
  leading_hypothesis: string;
  confidence: number;
  safety_flag: boolean;
  timestamp: string;
}

interface WireFaultTreeEntry {
  fault_id: string;
  symptoms: string[];
  hypotheses: WireHypothesis[];
  safety_flags: string[];
  illustration_path: string | null;
  video_path: string | null;
  source_session_id: string | null;
  created_at: string | null;
}

const attemptedStepToWire = (s: AttemptedStep): WireAttemptedStep => ({
  step: s.step,
  expected: s.expected,
  reported: s.reported,
  match: s.match,
});

// Mobile → Cloud. Strips `symptomRaw` and `hypothesis`/`timestamp` per-step
// (cloud schema has extra="forbid"). Coerces null leadingHypothesis to '' so
// the required-string field on cloud is satisfied.
export const handoffToWire = (r: HandoffReport): WireHandoffReport => ({
  session_id: r.sessionId,
  equipment_type: r.equipmentType,
  full_history: r.fullHistory.map(attemptedStepToWire),
  ruled_out: r.ruledOut,
  leading_hypothesis: r.leadingHypothesis ?? '',
  confidence: r.confidence,
  safety_flag: r.safetyFlag,
  timestamp: r.timestamp,
});

// Cloud → Mobile. The cloud FaultTreeEntry doesn't carry equipmentType so we
// derive it from the fault_id prefix (e.g. "diesel_genset_abc" → "diesel_genset").
const deriveEquipmentType = (faultId: string): string => {
  const parts = faultId.split('_');
  if (parts.length <= 1) return 'unknown';
  return parts.slice(0, -1).join('_');
};

const hypothesisFromWire = (h: WireHypothesis): FaultTreeHypothesis => ({
  name: h.name,
  diagnosticStep: h.diagnostic_step,
  expectedResult: h.expected_result,
  ifConfirmed: h.if_confirmed,
  ifRuledOut: h.if_ruled_out,
});

export const faultTreeFromWire = (w: WireFaultTreeEntry): FaultTreeEntry => ({
  faultId: w.fault_id,
  equipmentType: deriveEquipmentType(w.fault_id),
  symptoms: w.symptoms,
  hypotheses: (w.hypotheses ?? []).map(hypothesisFromWire),
  safetyFlags: w.safety_flags ?? [],
  updatedAt: w.created_at ?? new Date().toISOString(),
});

export type {WireHandoffReport, WireFaultTreeEntry};
