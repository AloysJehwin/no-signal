export interface OutcomeMatch {
  match: boolean;
  evidence: string;
}

const NEGATIONS = ['no', 'not', 'never', 'nothing', 'none', "won't", "didn't", "doesn't"];

const normalize = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9. ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const extractNumber = (s: string): number | null => {
  const m = s.match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
};

const extractComparator = (s: string): '>' | '<' | '>=' | '<=' | '=' | null => {
  if (s.includes('>=')) return '>=';
  if (s.includes('<=')) return '<=';
  if (s.includes('>')) return '>';
  if (s.includes('<')) return '<';
  if (s.includes('=')) return '=';
  return null;
};

const isNegated = (s: string): boolean => NEGATIONS.some(n => s.split(' ').includes(n));

export const checkOutcome = (expected: string, reported: string): OutcomeMatch => {
  const e = normalize(expected);
  const r = normalize(reported);

  const cmp = extractComparator(e);
  const eNum = extractNumber(e);
  const rNum = extractNumber(r);

  if (cmp && eNum !== null && rNum !== null) {
    const match =
      (cmp === '>' && rNum > eNum) ||
      (cmp === '<' && rNum < eNum) ||
      (cmp === '>=' && rNum >= eNum) ||
      (cmp === '<=' && rNum <= eNum) ||
      (cmp === '=' && rNum === eNum);
    return {
      match,
      evidence: `expected ${cmp}${eNum}, reported ${rNum}`,
    };
  }

  if (isNegated(r) && !isNegated(e)) return {match: false, evidence: 'reported negation of expected'};

  const eTokens = new Set(e.split(' ').filter(Boolean));
  const rTokens = new Set(r.split(' ').filter(Boolean));
  let overlap = 0;
  eTokens.forEach(t => {
    if (rTokens.has(t)) overlap++;
  });
  const ratio = eTokens.size ? overlap / eTokens.size : 0;
  return {match: ratio >= 0.5, evidence: `token overlap ${overlap}/${eTokens.size}`};
};
