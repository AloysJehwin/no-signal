import {AttemptedStep} from '../state/AttemptedStep';

export interface HandoffReport {
  sessionId: string;
  equipmentType: string;
  symptomRaw: string;
  fullHistory: AttemptedStep[];
  ruledOut: string[];
  leadingHypothesis: string | null;
  confidence: number;
  safetyFlag: boolean;
  timestamp: string;
}
