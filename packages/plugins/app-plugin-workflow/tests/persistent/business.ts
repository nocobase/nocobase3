import { DatabaseSync } from 'node:sqlite';

/** Application-owned idempotency, deliberately independent of queue job IDs. */
export class DurableBusinessEffect {
  private readonly database: DatabaseSync;

  constructor(filename: string) {
    this.database = new DatabaseSync(filename);
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS acceptance_attempts (
        id INTEGER PRIMARY KEY, business_key TEXT NOT NULL, process_id INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS acceptance_effects (
        business_key TEXT PRIMARY KEY, payload TEXT NOT NULL, process_id INTEGER NOT NULL
      );
    `);
  }

  apply(businessKey: string, payload: unknown): void {
    const serialized = JSON.stringify(payload);
    this.database.exec('BEGIN IMMEDIATE');
    try {
      this.database
        .prepare(
          'INSERT INTO acceptance_attempts (business_key, process_id) VALUES (?, ?)',
        )
        .run(businessKey, process.pid);
      this.database
        .prepare(
          'INSERT INTO acceptance_effects (business_key, payload, process_id) VALUES (?, ?, ?) ON CONFLICT (business_key) DO NOTHING',
        )
        .run(businessKey, serialized, process.pid);
      const effect = this.database
        .prepare(
          'SELECT payload FROM acceptance_effects WHERE business_key = ?',
        )
        .get(businessKey);
      if (effect?.payload !== serialized)
        throw new Error('Business key reused with different input');
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  snapshot(): {
    attempts: Record<string, unknown>[];
    effects: Record<string, unknown>[];
  } {
    return {
      attempts: this.database
        .prepare('SELECT * FROM acceptance_attempts ORDER BY id')
        .all(),
      effects: this.database
        .prepare('SELECT * FROM acceptance_effects ORDER BY business_key')
        .all(),
    };
  }

  close(): void {
    this.database.close();
  }
}
