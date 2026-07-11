import {GemmaBridge} from './GemmaBridge';
import {LocalRagStore} from '../rag/LocalRagStore';
import {SessionStore} from '../state/SessionStore';
import {SessionState} from '../state/SessionState';
import {AttemptedStep} from '../state/AttemptedStep';
import {SymptomInput} from '../sense/SymptomInput';
import {checkOutcome} from '../check/OutcomeChecker';
import {HandoffReport} from '../sync/HandoffReport';
import {SyncQueue} from '../sync/SyncQueue';
import {buildConversationLog} from '../sync/ConversationLog';
import {FaultTreeEntry} from '../rag/FaultTreeEntry';
import {MediaGenerator} from './MediaGenerator';

const SAFETY_KEYWORDS = [
  'sparking', 'fuel leak', 'burning smell', 'smoke', 'shock', 'fire', 'gas smell',
];

export interface DecideResult {
  hypothesis: string;
  step: string;
  substeps: string[];
  expected: string;
  confidence: number;
  visualObservations: string[];
  audioObservations: string[];
  illustrationPrompts: string[];
  ttsScript: string;
  referenceSoundPrompt: string;
  substepImages: (string | null)[];
  ttsUri: string | null;
  referenceSoundUri: string | null;
}

export const MAX_FAILURES = 3;

export class ReasoningLoop {
  private failures = 0;
  private photoUri: string | null = null;
  private audioUri: string | null = null;

  constructor(
    private readonly rag: LocalRagStore = LocalRagStore.instance,
    private readonly store: SessionStore = SessionStore.instance,
    private readonly gemma = GemmaBridge,
    private readonly queue: SyncQueue = SyncQueue.instance,
    private readonly media = MediaGenerator,
  ) {}

  sense(input: SymptomInput): SessionState {
    this.photoUri = input.photoUri ?? null;
    this.audioUri = input.audioUri ?? null;
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
    const raw = await this.gemma.runInference(prompt, this.photoUri, this.audioUri);
    const parsed = this.parseDecide(raw);
    this.store.setHypothesis(parsed.hypothesis, parsed.confidence);

    // Generate all media (images + TTS + optional reference sound) in parallel.
    // Failures are non-fatal: the step card renders without the missing media.
    try {
      const media = await this.media.generateAll({
        illustrationPrompts: parsed.illustrationPrompts,
        ttsScript: parsed.ttsScript,
        referenceSoundPrompt: parsed.referenceSoundPrompt,
      });
      parsed.substepImages = media.substepImages;
      parsed.ttsUri = media.ttsUri;
      parsed.referenceSoundUri = media.referenceSoundUri;
    } catch {
      // Keep the placeholder empty arrays already on parsed.
    }
    return parsed;
  }

  act(step: DecideResult): void {
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
    // Also push the full turn-by-turn conversation to the training pipeline
    // so the cloud can extract learning signal from every substep.
    void this.queue.enqueueConversation(buildConversationLog({
      ...s,
      status: 'deferred',
    }));
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
        'Return JSON per schema. Include illustrationPrompts (one per substep), ttsScript, and referenceSoundPrompt.',
    });
  }

  private parseDecide(raw: string): DecideResult {
    try {
      const j = JSON.parse(raw);
      const toStrArray = (v: unknown): string[] =>
        Array.isArray(v) ? v.map(s => String(s)).filter(Boolean) : [];
      const substeps = toStrArray(j.substeps);
      const illustrationPrompts = toStrArray(j.illustrationPrompts);
      // Enforce parity: exactly one prompt per substep. Pad with empty strings if short.
      const alignedPrompts = substeps.map((_, i) => illustrationPrompts[i] ?? '');
      return {
        hypothesis: String(j.hypothesis ?? '').trim() || 'Unable to determine cause',
        step: String(j.step ?? '').trim() || 'Try again with more detail about the symptom',
        substeps,
        expected: String(j.expected ?? '').trim() || 'A clearer diagnosis',
        confidence: Number(j.confidence ?? 0),
        visualObservations: toStrArray(j.visualObservations),
        audioObservations: toStrArray(j.audioObservations),
        illustrationPrompts: alignedPrompts,
        ttsScript: String(j.ttsScript ?? '').trim(),
        referenceSoundPrompt: String(j.referenceSoundPrompt ?? '').trim(),
        substepImages: substeps.map(() => null),
        ttsUri: null,
        referenceSoundUri: null,
      };
    } catch {
      throw new Error('The model returned an unreadable response. Please try again.');
    }
  }
}
