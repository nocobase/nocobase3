import { afterEach, describe, expect, it } from 'vitest';
import { createDatabaseManager, TransactionPostCommitError } from '@nocobase/db';
import sqlite from '@nocobase/db-sqlite';

const databases: ReturnType<typeof createDatabaseManager>[] = [];
function setup() {
  const database = createDatabaseManager({ drivers: { sqlite }, default: 'main', connections: { main: { dialect: 'sqlite', filename: ':memory:' } } });
  databases.push(database);
  return database.connection();
}
afterEach(async () => { for (const database of databases.splice(0)) await database.destroy(); });
describe('transaction completion', () => {
  it('defers successful savepoint effects until the outer commit and discards rolled-back children', async () => {
    const connection = setup();
    const events: string[] = [];
    await connection.transaction(async (outer) => {
      outer.afterCommit(() => { events.push('outer'); });
      await outer.transaction(async (inner) => { inner.afterCommit(() => { events.push('inner'); }); });
      await expect(outer.transaction(async (inner) => {
        inner.afterCommit(() => { events.push('rolled back'); });
        throw new Error('child failure');
      })).rejects.toThrow('child failure');
      expect(events).toEqual([]);
    });
    expect(events).toEqual(['outer', 'inner']);
  });
  it('discards successful child effects when the outer transaction rolls back', async () => {
    const connection = setup();
    const events: string[] = [];
    await expect(connection.transaction(async (outer) => {
      await outer.transaction(async (inner) => { inner.afterCommit(() => { events.push('unexpected'); }); });
      throw new Error('outer failure');
    })).rejects.toThrow('outer failure');
    expect(events).toEqual([]);
  });
  it('reports a committed failure without undoing data or skipping later effects', async () => {
    const connection = setup();
    await connection.builder.createCollection('events', (table) => { table.string('id').primary(); });
    const effects: string[] = [];
    await expect(connection.transaction(async (tx) => {
      await tx.query.insertInto('events').values({ id: 'committed' }).execute();
      tx.afterCommit(() => { throw new Error('notification failed'); });
      tx.afterCommit(() => { effects.push('next'); });
    })).rejects.toBeInstanceOf(TransactionPostCommitError);
    expect(await connection.query.selectFrom('events').select('id').execute()).toEqual([{ id: 'committed' }]);
    expect(effects).toEqual(['next']);
    expect(() => connection.afterCommit(() => {})).toThrow('tracked transaction');
  });
});
