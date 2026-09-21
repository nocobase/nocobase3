import { createDatabaseManager } from '@nocobase/db';
import { describe, expect, it } from 'vitest';
import sqlite from '../src/index.js';

const utc = '2026-09-06T09:30:00.120Z';

function localDatetime(instant: Date): string {
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${instant.getFullYear()}-${pad(instant.getMonth() + 1)}-${pad(instant.getDate())}T${pad(instant.getHours())}:${pad(instant.getMinutes())}:${pad(instant.getSeconds())}.${String(instant.getMilliseconds()).padStart(3, '0')}`;
}

describe('datetime rows holding a zone offset on SQLite', () => {
  it('reads timestamps the pre-normalization query builder stored verbatim', async () => {
    const database = createDatabaseManager({
      default: 'main',
      drivers: { sqlite },
      connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
    });

    try {
      const connection = database.connection();
      await connection.builder.createCollection('sessions', (collection) => {
        collection.increments('id');
        collection.datetime('expiresAt');
      });

      // Before `database.query()` normalized strings, an ISO instant written to a `datetime` column was passed
      // to the driver untouched, and SQLite's TEXT affinity kept the offset. The write reported success and the
      // row was then unreadable, because no valid local datetime carries one. Such rows still exist.
      const client = await connection.client<any>();
      await client('sessions').insert([
        { id: 1, expires_at: utc },
        { id: 2, expires_at: '2026-09-06T17:30:00.120+08:00' },
      ]);

      const expiresAt = localDatetime(new Date(utc));
      await expect(
        connection.query
          .selectFrom('sessions')
          .select(['id', 'expiresAt'])
          .orderBy('id')
          .execute(),
      ).resolves.toEqual([
        { id: 1, expiresAt },
        { id: 2, expiresAt },
      ]);
      await expect(
        database
          .repository('sessions')
          .findMany({ sort: (sort) => sort.field('id').asc() }),
      ).resolves.toEqual([
        { id: 1, expiresAt },
        { id: 2, expiresAt },
      ]);
    } finally {
      await database.destroy();
    }
  });
});
