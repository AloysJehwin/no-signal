import {ReasoningLoop} from '../src/decide/ReasoningLoop';
import {SessionStore} from '../src/state/SessionStore';
import {LocalRagStore} from '../src/rag/LocalRagStore';
import {SyncQueue} from '../src/sync/SyncQueue';

jest.mock('../src/decide/GemmaBridge', () => ({
  GemmaBridge: {
    runInference: jest.fn(),
    isReady: jest.fn().mockResolvedValue(true),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const {GemmaBridge} = require('../src/decide/GemmaBridge');

describe('ReasoningLoop revise-on-failure', () => {
  beforeEach(() => {
    SessionStore.instance.reset();
    (GemmaBridge.runInference as jest.Mock).mockReset();
  });

  it('rules out failed hypothesis and picks a new one on the next decide', async () => {
    const rag = {
      init: jest.fn(),
      searchBySymptoms: jest.fn().mockResolvedValue([]),
      all: jest.fn().mockResolvedValue([]),
      upsertEntry: jest.fn(),
    } as unknown as LocalRagStore;
    const queue = {enqueue: jest.fn().mockResolvedValue(undefined)} as unknown as SyncQueue;

    (GemmaBridge.runInference as jest.Mock)
      .mockResolvedValueOnce(
        JSON.stringify({hypothesis: 'weak_battery', step: 'measure battery', expected: '>12V', confidence: 0.6}),
      )
      .mockResolvedValueOnce(
        JSON.stringify({hypothesis: 'starter_motor', step: 'tap starter', expected: 'engine cranks', confidence: 0.5}),
      );

    const loop = new ReasoningLoop(rag, SessionStore.instance, GemmaBridge, queue);
    loop.sense({equipmentType: 'diesel_genset', symptomRaw: "won't start", capturedAt: 'now'});

    const first = await loop.decide();
    expect(first.hypothesis).toBe('weak_battery');

    loop.check(first, '11.1V');
    const session = SessionStore.instance.current;
    expect(session?.ruledOutHypotheses).toContain('weak_battery');
    expect(session?.status).toBe('in_progress');

    const second = await loop.decide();
    expect(second.hypothesis).toBe('starter_motor');
  });
});
