import { afterEach, describe, expect, it } from 'vitest';
import type { Knex } from 'knex';
import sqlite from '../src/index.js';
import { createDatabaseManager, type DatabaseManager } from '@nocobase/db';

const managers: DatabaseManager[] = [];

afterEach(async () => {
  for (const manager of managers.splice(0)) {
    await manager.destroy();
  }
});

function database(): DatabaseManager {
  const manager = createDatabaseManager({
    drivers: { sqlite },
    connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
  });
  managers.push(manager);
  return manager;
}

describe('recreating a Collection whose metadata outlived its table', () => {
  it('creates it again instead of failing to resolve the stale metadata', async () => {
    const db = database();
    const connection = db.connection();
    await connection.builder.createCollection('leads', (collection) => {
      collection.increments('id');
      collection.datetime('createdAt', { nullable: false });
    });

    // What a hand-rolled reset leaves behind: the physical table is gone while
    // the metadata record for it remains, which is also the state a corrected
    // migration re-runs into.
    const knex = await connection.client<Knex>();
    await knex.raw('drop table leads');
    connection.collections.invalidate();
    expect(
      await knex('__nocobase_collection_metadata').where({ name: 'leads' }),
    ).toHaveLength(1);

    await connection.builder.createCollection('leads', (collection) => {
      collection.increments('id');
      collection.datetimeTz('createdAt', { nullable: false });
    });

    expect(await knex.schema.hasTable('leads')).toBe(true);
    const collection = await connection.collections.get('leads');
    expect(collection?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'createdAt', type: 'datetimeTz' }),
      ]),
    );
  });

  it('still reports the drift for an operation that needs the missing table', async () => {
    const db = database();
    const connection = db.connection();
    await connection.builder.createCollection('leads', (collection) => {
      collection.increments('id');
    });

    const knex = await connection.client<Knex>();
    await knex.raw('drop table leads');
    connection.collections.invalidate();

    await expect(
      connection.builder.addField('leads', {
        name: 'status',
        type: 'string',
      }),
    ).rejects.toThrow(/maps to missing physical table "leads"/);
  });
});
