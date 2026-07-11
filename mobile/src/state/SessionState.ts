import {AttemptedStep} from './AttemptedStep';
import {EquipmentType} from '../sense/SymptomInput';

export type SessionStatus = 'in_progress' | 'resolved' | 'deferred';

export interface SessionState {
  sessionId: string;
  equipmentType: EquipmentType;
  symptomRaw: string;
  attemptedSteps: AttemptedStep[];
  ruledOutHypotheses: string[];
  currentHypothesis: string | null;
  confidence: number;
  status: SessionStatus;
  startedAt: string;
  updatedAt: string;
}

export const newSession = (
  sessionId: string,
  equipmentType: EquipmentType,
  symptomRaw: string,
): SessionState => {
  const now = new Date().toISOString();
  return {
    sessionId,
    equipmentType,
    symptomRaw,
    attemptedSteps: [],
    ruledOutHypotheses: [],
    currentHypothesis: null,
    confidence: 0,
    status: 'in_progress',
    startedAt: now,
    updatedAt: now,
  };
};
