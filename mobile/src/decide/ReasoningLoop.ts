import {GemmaBridge} from './GemmaBridge';
import {LocalRagStore} from '../rag/LocalRagStore';
import {SessionStore} from '../state/SessionStore';
import {SessionState} from '../state/SessionState';
import {AttemptedStep} from '../state/AttemptedStep';
import {SymptomInput} from '../sense/SymptomInput';
import {checkOutcome} from '../check/OutcomeChecker';
import {HandoffReport} from '../sync/HandoffReport';
import {SyncQueue} from '../sync/SyncQueue';
import {FaultTreeEntry} from '../rag/FaultTreeEntry';

// Any of these in a symptom or reported outcome jumps straight to DEFER —
// safety > loop completion. Kept as a plain list so operators can extend.
const SAFETY_KEYWORDS = [
  'sparking', 'fuel leak', 'burning smell', 'smoke', 'shock', 'fire', 'gas smell',
];

export interface DecideResult {
  hypothesis: string;
  step: string;
  expected: string;
  confidence: number;
}

export const MAX_FAILURES = 3;

export class ReasoningLoop {
  private failures = 0;

  constructor(
    private readonly rag: LocalRagStore = LocalRagStore.instance,
    private readonly store: SessionStore = SessionStore.instance,
    private readonly gemma = GemmaBridge,
    private readonly queue: SyncQueue = SyncQueue.instance,
  ) {}

  sense(input: SymptomInput): SessionState {
    if (this.containsSafetyKeyword(input.symptomRaw)) {
      const s = this.store.start(input.equipmentType, input.symptomRaw);
      this.defer(true);
      return s;
    }
    return this.store.start(input.equipmentType, input.symptomRaw);
  }

  async decide(): Promise<DecideResult> {
    const session = this.requireSession();
    const candidates = await this.rag.searchBySymptoms([session.symptomRaw]);
    const prompt = this.buildPrompt(session, candidates);
    const raw = await this.gemma.runInference(prompt);
    const parsed = this.parseDecide(raw);
    this.store.setHypothesis(parsed.hypothesis, parsed.confidence);
    return parsed;
  }

  act(step: DecideResult): void {
    // ACT is presentation-layer; kept as a hook so UI can subscribe.
    void step;
  }

  check(decide: DecideResult, reported: string): AttemptedStep {
    const outcome = checkOutcome(decide.expected, reported);
    const step: AttemptedStep = {
      step: decide.step,
      expected: decide.expected,
      reported,
      match: outcome.match,
      hypothesis: decide.hypothesis,
      timestamp: new Date().toISOString(),
    };
    this.store.addStep(step);

    if (this.containsSafetyKeyword(reported)) {
      this.defer(true);
      return step;
    }
    if (outcome.match) {
      this.store.markResolved();
      return step;
    }
    this.revise(decide.hypothesis);
    return step;
  }

  revise(ruledOut: string): void {
    this.store.ruleOutHypothesis(ruledOut);
    this.failures += 1;
    if (this.failures >= MAX_FAILURES) this.defer(false);
  }

  defer(safetyFlag: boolean): HandoffReport {
    const s = this.requireSession();
    const report: HandoffReport = {
      sessionId: s.sessionId,
      equipmentType: s.equipmentType,
      symptomRaw: s.symptomRaw,
      fullHistory: s.attemptedSteps,
      ruledOut: s.ruledOutHypotheses,
      leadingHypothesis: s.currentHypothesis,
      confidence: s.confidence,
      safetyFlag,
      timestamp: new Date().toISOString(),
    };
    this.store.markDeferred();
    void this.queue.enqueue(report);
    return report;
  }

  private containsSafetyKeyword(text: string): boolean {
    const t = text.toLowerCase();
    return SAFETY_KEYWORDS.some(k => t.includes(k));
  }

  private requireSession(): SessionState {
    const s = this.store.current;
    if (!s) throw new Error('no active session');
    return s;
  }

  private buildPrompt(session: SessionState, candidates: FaultTreeEntry[]): string {
    return JSON.stringify({
      task: 'diagnose',
      session,
      ruledOut: session.ruledOutHypotheses,
      candidates,
      instruction:
        'Return JSON {hypothesis, step, expected, confidence}. Exclude ruledOut.',
    });
  }

  private parseDecide(raw: string): DecideResult {
    try {
      const j = JSON.parse(raw);
      return {
        hypothesis: String(j.hypothesis ?? 'unknown'),
        step: String(j.step ?? ''),
        expected: String(j.expected ?? ''),
        confidence: Number(j.confidence ?? 0),
      };
    } catch {
      return {hypothesis: 'unknown', step: raw, expected: '', confidence: 0};
    }
  }
}
