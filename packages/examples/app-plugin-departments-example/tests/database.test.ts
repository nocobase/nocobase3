// @vitest-environment node
import path from 'node:path';

import { createDatabaseManager } from '@nocobase/db';
import sqlite from '@nocobase/db-sqlite';
import { describe, expect, it } from 'vitest';

import packageMetadata from '../package.json' with { type: 'json' };
import { DEMO_ACCOUNTS } from '../server/demo.js';
import { createTestApp } from './helpers.js';

const SEED = '202609250002_departments_example_seed_organization';

interface PhysicalIndex {
  readonly keys: readonly { readonly columnName: string }[];
  readonly unique: boolean;
}

function indexes(
  table: { readonly indexes: readonly PhysicalIndex[] } | undefined,
): { columns: string[]; unique: boolean }[] {
  return (table?.indexes ?? []).map((index) => ({
    columns: index.keys.map((key) => key.columnName),
    unique: index.unique,
  }));
}

describe('organization migration', () => {
  it('creates both tables with their keys and indexes, and drops them again', async () => {
    const database = createDatabaseManager({
      drivers: { sqlite },
      connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
    });
    try {
      const migrator = database.createMigrator({
        directory: path.resolve(import.meta.dirname, '../database/migrations'),
        packageName: packageMetadata.name,
      });
      await migrator.latest();
      const collections = database.connection().collections;

      const departments = await collections.getPhysical('departments');
      expect(departments?.columns.map((column) => column.columnName)).toEqual(
        expect.arrayContaining([
          'id',
          'title',
          'parent_id',
          'active',
          'sort_order',
        ]),
      );
      expect(
        departments?.columns.find((column) => column.columnName === 'title'),
      ).toMatchObject({ nullable: false });
      expect(departments?.primaryKey?.columns).toEqual(['id']);
      expect(indexes(departments)).toContainEqual({
        columns: ['parent_id'],
        unique: false,
      });

      const members = await collections.getPhysical('departmentMembers');
      expect(members?.columns.map((column) => column.columnName)).toEqual(
        expect.arrayContaining([
          'id',
          'department_id',
          'user_id',
          'primary',
          'active',
        ]),
      );
      expect(indexes(members)).toContainEqual({
        columns: ['department_id', 'user_id'],
        unique: true,
      });
      expect(indexes(members)).toContainEqual({
        columns: ['user_id'],
        unique: false,
      });
      expect(await collections.get('departmentMembers')).toBeDefined();

      await migrator.rollback();
      expect(await collections.get('departments')).toBeUndefined();
      expect(await collections.getPhysical('departments')).toBeUndefined();
      expect(
        await collections.getPhysical('departmentMembers'),
      ).toBeUndefined();
    } finally {
      await database.destroy();
    }
  });
});

describe('organization seed', () => {
  it('writes the tree, the staff set and its department assignment once, and a replay changes nothing', async () => {
    const first = await createTestApp();
    const directory = first.directory;
    const snapshot = async (app: typeof first) => {
      const query = app.database.connection().query;
      return {
        departments: await query
          .selectFrom('departments')
          .select(['id', 'title', 'parentId', 'active'])
          .orderBy('id', 'asc')
          .execute(),
        sets: await query
          .selectFrom('authorizationPermissionSets')
          .select(['key', 'title'])
          .where('key', '=', 'departments-example-staff')
          .execute(),
        assignments: await query
          .selectFrom('authorizationPermissionSetAssignments')
          .select(['permissionSetKey', 'subjectType', 'subjectId'])
          .where('permissionSetKey', '=', 'departments-example-staff')
          .execute(),
        members: await query
          .selectFrom('departmentMembers')
          .select(['departmentId', 'userId'])
          .orderBy('departmentId', 'asc')
          .execute(),
      };
    };
    try {
      const seeded = await snapshot(first);
      expect(seeded.departments.map((row) => row.id)).toEqual([
        'hq',
        'sales',
        'sales-east',
        'support',
      ]);
      expect(seeded.assignments).toEqual([
        {
          permissionSetKey: 'departments-example-staff',
          subjectType: 'org.department',
          subjectId: 'hq',
        },
      ]);
      // The demo accounts are created once at start, each with its membership.
      expect(seeded.members.map((row) => row.departmentId)).toEqual(
        DEMO_ACCOUNTS.map((account) => account.departmentId).sort(),
      );

      // An administrator renames a department; a deliberate replay must keep that.
      await first.organization.updateDepartment('sales', {
        title: 'Sales and marketing',
      });
      await first.database
        .connection()
        .query.deleteFrom('__nocobase_seeds')
        .where('name', '=', SEED)
        .execute();
      await first.close({ keep: true });

      const second = await createTestApp({ directory });
      try {
        const replayed = await snapshot(second);
        const history = await second.database
          .connection()
          .query.selectFrom('__nocobase_seeds')
          .select('name')
          .where('name', '=', SEED)
          .execute();
        expect(history).toHaveLength(1);
        expect(replayed.sets).toEqual(seeded.sets);
        expect(replayed.assignments).toEqual(seeded.assignments);
        expect(replayed.members).toEqual(seeded.members);
        expect(replayed.departments).toEqual(
          seeded.departments.map((row) =>
            row.id === 'sales' ? { ...row, title: 'Sales and marketing' } : row,
          ),
        );
      } finally {
        await second.close();
      }
    } catch (error) {
      await first.close().catch(() => undefined);
      throw error;
    }
  }, 60_000);
});
