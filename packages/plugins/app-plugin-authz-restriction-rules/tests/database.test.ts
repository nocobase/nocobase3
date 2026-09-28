import { fileURLToPath } from 'node:url';
import sqlite from '@nocobase/db-sqlite';
import {
  createDatabaseManager,
  InMemoryCollectionMetadataStore,
  validateMigrations,
} from '@nocobase/db';
import { describe, expect, it } from 'vitest';
import { selection } from '@nocobase/authorization/core';
import { createAppAuthorization } from '@nocobase/app-plugin-authorization/server';
import { restrictionRules } from '../server/authorization.js';
import migration from '../database/migrations/202608210004_create_restriction_rules.js';

const tables = [
  'authorization_restriction_rules',
  'authorization_restriction_rule_assignments',
];

describe('@nocobase/app-plugin-authz-restriction-rules migration', () => {
  it('owns its rule migration', async () => {
    const migrationsDirectory = fileURLToPath(
      new URL('../database/migrations', import.meta.url),
    );
    await expect(
      validateMigrations(migrationsDirectory),
    ).resolves.toMatchObject([
      { name: '202608210004_create_restriction_rules' },
    ]);
  });

  it('creates and removes its physical tables', async () => {
    const database = createDatabaseManager({
      drivers: { sqlite },
      default: 'main',
      metadataStore: new InMemoryCollectionMetadataStore(),
      connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
    });
    try {
      const connection = database.connection();
      const context = {
        builder: connection.builder,
        query: connection.query,
        connection,
      };
      const client = await connection.client<{
        schema: { hasTable(name: string): Promise<boolean> };
      }>();
      await migration.up(context);
      for (const table of tables)
        expect(await client.schema.hasTable(table)).toBe(true);
      await migration.down?.(context);
      for (const table of tables)
        expect(await client.schema.hasTable(table)).toBe(false);
    } finally {
      await database.destroy();
    }
  });

  it('persists a rule with per-scope record ids through authz.restrictionRules', async () => {
    const database = createDatabaseManager({
      drivers: { sqlite },
      default: 'main',
      metadataStore: new InMemoryCollectionMetadataStore(),
      connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
    });
    try {
      const connection = database.connection();
      await migration.up({
        builder: connection.builder,
        query: connection.query,
        connection,
      });
      const authz = createAppAuthorization({
        connection,
        config: { plugins: [restrictionRules()] },
      });
      const resource = { type: 'composite', id: 'sales.submit' };
      const actions = [
        {
          action: 'submit',
          scopeKey: 'projects',
          selection: selection.records(['shared-id', 'project-2']),
        },
        {
          action: 'submit',
          scopeKey: 'quotes',
          selection: selection.records(['shared-id', 'quote-2']),
        },
      ];

      await authz.restrictionRules.create({
        key: 'scoped',
        resource,
        actions,
        subjects: [],
      });
      await expect(authz.restrictionRules.get('scoped')).resolves.toMatchObject(
        {
          resource,
          actions,
        },
      );
      await authz.restrictionRules.delete('scoped');
      await expect(
        authz.restrictionRules.get('scoped'),
      ).resolves.toBeUndefined();
    } finally {
      await database.destroy();
    }
  });
});
