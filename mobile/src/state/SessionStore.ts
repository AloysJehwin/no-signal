import {SessionState, SessionStatus, newSession} from './SessionState';
import {AttemptedStep} from './AttemptedStep';
import {EquipmentType} from '../sense/SymptomInput';

type Listener = (s: SessionState | null) => void;

const uuid = (): string =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

export class SessionStore {
  static readonly instance = new SessionStore();
  private state: SessionState | null = null;
  private listeners = new Set<Listener>();

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    l(this.state);
    return () => this.listeners.delete(l);
  }

  get current(): SessionState | null {
    return this.state;
  }

  start(equipmentType: EquipmentType, symptomRaw: string): SessionState {
    this.state = newSession(uuid(), equipmentType, symptomRaw);
    this.emit();
    return this.state;
  }

  addStep(step: AttemptedStep): void {
    if (!this.state) return;
    this.state = {
      ...this.state,
      attemptedSteps: [...this.state.attemptedSteps, step],
      updatedAt: new Date().toISOString(),
    };
    this.emit();
  }

  ruleOutHypothesis(name: string): void {
    if (!this.state) return;
    if (this.state.ruledOutHypotheses.includes(name)) return;
    this.state = {
      ...this.state,
      ruledOutHypotheses: [...this.state.ruledOutHypotheses, name],
      updatedAt: new Date().toISOString(),
    };
    this.emit();
  }

  setHypothesis(name: string, confidence: number): void {
    if (!this.state) return;
    this.state = {
      ...this.state,
      currentHypothesis: name,
      confidence,
      updatedAt: new Date().toISOString(),
    };
    this.emit();
  }

  markResolved(): void {
    this.setStatus('resolved');
  }

  markDeferred(): void {
    this.setStatus('deferred');
  }

  reset(): void {
    this.state = null;
    this.emit();
  }

  private setStatus(status: SessionStatus): void {
    if (!this.state) return;
    this.state = {...this.state, status, updatedAt: new Date().toISOString()};
    this.emit();
  }

  private emit(): void {
    this.listeners.forEach(l => l(this.state));
  }
}
