import {checkOutcome} from '../src/check/OutcomeChecker';

describe('OutcomeChecker', () => {
  it('flags a numeric mismatch as no match with evidence', () => {
    const r = checkOutcome('>12V', '11.2V');
    expect(r.match).toBe(false);
    expect(r.evidence).toContain('11.2');
  });

  it('accepts a numeric match', () => {
    const r = checkOutcome('>12V', '12.7V');
    expect(r.match).toBe(true);
  });

  it('detects negation mismatch on free text', () => {
    const r = checkOutcome('engine cranks', 'engine did not crank');
    expect(r.match).toBe(false);
  });
});
