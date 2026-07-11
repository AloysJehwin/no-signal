import SQLite, {SQLiteDatabase} from 'react-native-sqlite-storage';
import {FaultTreeEntry} from './FaultTreeEntry';

SQLite.enablePromise(true);

const DB_NAME = 'fieldfix.db';

const CREATE_SQL = `
CREATE TABLE IF NOT EXISTS fault_tree (
  fault_id TEXT PRIMARY KEY,
  equipment_type TEXT NOT NULL,
  symptoms TEXT NOT NULL,
  hypotheses TEXT NOT NULL,
  safety_flags TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

const tokenize = (s: string): string[] =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

export class LocalRagStore {
  static readonly instance = new LocalRagStore();
  private db: SQLiteDatabase | null = null;

  async init(): Promise<void> {
    if (this.db) return;
    this.db = await SQLite.openDatabase({name: DB_NAME, location: 'default'});
    await this.db.executeSql(CREATE_SQL);
  }

  async upsertEntry(entry: FaultTreeEntry): Promise<void> {
    const db = this.require();
    await db.executeSql(
      `INSERT OR REPLACE INTO fault_tree
       (fault_id, equipment_type, symptoms, hypotheses, safety_flags, updated_at)
       VALUES (?, ?, ?, ?, ?, ?);`,
      [
        entry.faultId,
        entry.equipmentType,
        JSON.stringify(entry.symptoms),
        JSON.stringify(entry.hypotheses),
        JSON.stringify(entry.safetyFlags),
        entry.updatedAt,
      ],
    );
  }

  async all(): Promise<FaultTreeEntry[]> {
    const db = this.require();
    const [rs] = await db.executeSql('SELECT * FROM fault_tree;');
    const out: FaultTreeEntry[] = [];
    for (let i = 0; i < rs.rows.length; i++) out.push(this.rowToEntry(rs.rows.item(i)));
    return out;
  }

  async searchBySymptoms(symptoms: string[]): Promise<FaultTreeEntry[]> {
    const entries = await this.all();
    const query = new Set(symptoms.flatMap(tokenize));
    return entries
      .map(e => ({e, score: this.score(e, query)}))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(x => x.e);
  }

  private score(e: FaultTreeEntry, query: Set<string>): number {
    const entryTokens = new Set(e.symptoms.flatMap(tokenize));
    let hits = 0;
    query.forEach(t => {
      if (entryTokens.has(t)) hits++;
    });
    return hits;
  }

  private require(): SQLiteDatabase {
    if (!this.db) throw new Error('LocalRagStore.init() not called');
    return this.db;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private rowToEntry(row: any): FaultTreeEntry {
    return {
      faultId: row.fault_id,
      equipmentType: row.equipment_type,
      symptoms: JSON.parse(row.symptoms),
      hypotheses: JSON.parse(row.hypotheses),
      safetyFlags: JSON.parse(row.safety_flags),
      updatedAt: row.updated_at,
    };
  }
}
