export interface AttemptedStep {
  step: string;
  expected: string;
  reported: string;
  match: boolean;
  hypothesis: string;
  timestamp: string;
}
