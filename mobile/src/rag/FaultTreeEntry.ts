export interface FaultTreeHypothesis {
  name: string;
  diagnosticStep: string;
  expectedResult: string;
  ifConfirmed: string;
  ifRuledOut: string;
}

export interface FaultTreeEntry {
  faultId: string;
  equipmentType: string;
  symptoms: string[];
  hypotheses: FaultTreeHypothesis[];
  safetyFlags: string[];
  updatedAt: string;
}
