import { createDatabaseManager } from '@nocobase/db';
import { describe, expect, it } from 'vitest';
import sqlite from '../src/index.js';

// The instant the legacy rows were written for: `new Date('2026-09-20T12:52:16.452Z')`.
const epochMilliseconds = 1789908736452;

function localDatetime(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${String(date.getMilliseconds()).padStart(3, '0')}`;
}

describe('legacy epoch datetime rows on SQLite', () => {
  it('reads timestamps the pre-normalization query builder stored as epoch milliseconds', async () => {
    const database = createDatabaseManager({
      default: 'main',
      drivers: { sqlite },
      connections: {
        main: { dialect: 'sqlite', filename: ':memory:' },
      },
    });

    try {
      const connection = database.connection();
      await connection.builder.createCollection('sessions', (collection) => {
        collection.increments('id');
        collection.datetime('expiresAt');
        collection.datetimeTz('createdAt');
      });

      // Before temporal Fields were normalized, `database.query()` handed `Date` values straight to knex, which
      // binds a `Date` on SQLite as `getTime()`. A REAL column keeps the number; a TEXT column stores it as text
      // with a trailing `.0`. Both shapes exist in databases that upgraded in place.
      const client = await connection.client<any>();
      await client('sessions').insert([
        { id: 1, expires_at: epochMilliseconds, created_at: epochMilliseconds },
        {
          id: 2,
          expires_at: `${epochMilliseconds}.0`,
          created_at: `${epochMilliseconds}.0`,
        },
      ]);

      const rows = await connection.query
        .selectFrom('sessions')
        .select(['id', 'expiresAt', 'createdAt'])
        .orderBy('id')
        .execute();

      const expiresAt = localDatetime(new Date(epochMilliseconds));
      expect(rows).toEqual([
        { id: 1, expiresAt, createdAt: '2026-09-20T12:52:16.452Z' },
        { id: 2, expiresAt, createdAt: '2026-09-20T12:52:16.452Z' },
      ]);
    } finally {
      await database.destroy();
    }
  });
});
