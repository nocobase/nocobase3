// @vitest-environment node
import path from 'node:path';

import { createDatabaseManager } from '@nocobase/db';
import sqlite from '@nocobase/db-sqlite';
import { describe, expect, it } from 'vitest';

import packageMetadata from '../package.json' with { type: 'json' };
import {
  DEMO_ACCOUNTS,
  DEMO_PASSWORD,
  SEED_DEPARTMENTS,
} from '../database/seed-data/organization.js';
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
          'region',
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
  it('writes the tree, the demo accounts, their assignments and regions once, and a replay changes nothing', async () => {
    const first = await createTestApp();
    const directory = first.directory;
    const snapshot = async (app: typeof first) => {
      const query = app.database.connection().query;
      const demoUsers = (
        await query
          .selectFrom('user')
          .select('id')
          .where('email', 'like', '%@departments.example')
          .execute()
      ).map((row) => String(row.id));
      return {
        departments: await query
          .selectFrom('departments')
          .select(['id', 'title', 'parentId', 'region', 'active'])
          .orderBy('id', 'asc')
          .execute(),
        assignments: await query
          .selectFrom('authorizationPermissionSetAssignments')
          .leftJoin('user', 'user.id', 'subjectId')
          .select(['permissionSetKey', 'subjectType', 'subjectId', 'email'])
          .where((where) =>
            where.or([
              where('subjectType', '=', 'org.department'),
              where('subjectId', 'in', demoUsers),
            ]),
          )
          .orderBy('permissionSetKey', 'asc')
          .orderBy('subjectId', 'asc')
          .execute(),
        sharing: await query
          .selectFrom('authorizationSharingRuleAssignments')
          .select(['sharingRuleId', 'subjectId'])
          .where('subjectType', '=', 'org.department')
          .orderBy('sharingRuleId', 'asc')
          .orderBy('subjectId', 'asc')
          .execute(),
        restrictions: await query
          .selectFrom('authorizationRestrictionRuleAssignments')
          .select(['restrictionRuleId', 'subjectId'])
          .where('subjectType', '=', 'org.department')
          .orderBy('restrictionRuleId', 'asc')
          .execute(),
        users: await query
          .selectFrom('user')
          .innerJoin('account', 'account.userId', 'user.id')
          .select(['user.id', 'user.email', 'account.providerId'])
          .where('user.email', 'like', '%@departments.example')
          .orderBy('user.email', 'asc')
          .execute(),
        members: await query
          .selectFrom('departmentMembers')
          .innerJoin('user', 'user.id', 'departmentMembers.userId')
          .select(['departmentId', 'email', 'primary'])
          .orderBy('email', 'asc')
          .orderBy('departmentId', 'asc')
          .execute(),
        regions: await query
          .selectFrom('authorizationExampleSalesMembers')
          .innerJoin('user', 'user.id', 'authorizationExampleSalesMembers.id')
          .select(['email', 'region'])
          .where('email', 'like', '%@departments.example')
          .orderBy('email', 'asc')
          .execute(),
      };
    };
    try {
      const seeded = await snapshot(first);
      expect(seeded.departments.map((row) => row.id)).toEqual(
        SEED_DEPARTMENTS.map((row) => row.id).sort(),
      );
      // Seeded titles are stored as translation descriptors, the way permission-set titles are.
      expect(
        seeded.departments.find((row) => row.id === 'north-sales'),
      ).toMatchObject({
        title: JSON.stringify({
          key: 'seed.northSales',
          ns: '@nocobase/app-plugin-departments-example',
        }),
        parentId: 'sales-center',
        region: 'North',
      });
      expect(
        seeded.assignments.map((row) => [
          row.permissionSetKey,
          row.subjectType === 'user' ? row.email : row.subjectId,
        ]),
      ).toEqual(
        expect.arrayContaining([
          ['example-sales-assistant', 'sales-center'],
          ['example-sales-delivery', 'delivery'],
          ['example-sales-engineer', 'leo@departments.example'],
          ['example-sales-engineer', 'eric@departments.example'],
          ['example-sales-manager', 'grace@departments.example'],
        ]),
      );
      expect(seeded.assignments).toHaveLength(5);
      expect(seeded.sharing).toEqual([
        { sharingRuleId: 'example-delivery-orders', subjectId: 'delivery' },
        { sharingRuleId: 'example-delivery-orders', subjectId: 'sales-center' },
        {
          sharingRuleId: 'example-selected-projects',
          subjectId: 'executive-office',
        },
      ]);
      expect(seeded.restrictions).toHaveLength(3);
      // Each demo account is a credential account with its memberships.
      expect(seeded.users.map((row) => [row.email, row.providerId])).toEqual(
        DEMO_ACCOUNTS.map((account) => [account.email, 'credential']).sort(),
      );
      expect(
        seeded.members.map((row) => [
          row.email,
          row.departmentId,
          Boolean(row.primary),
        ]),
      ).toEqual(
        DEMO_ACCOUNTS.flatMap((account) =>
          account.memberships.map((membership) => [
            account.email,
            membership.departmentId,
            membership.primary,
          ]),
        ).sort((a, b) =>
          `${String(a[0])}/${String(a[1])}`.localeCompare(
            `${String(b[0])}/${String(b[1])}`,
          ),
        ),
      );
      // The HR sync wrote the regional accounts' sales region; Chen's primary department decides his.
      expect(seeded.regions).toEqual([
        { email: 'chen@departments.example', region: 'South' },
        { email: 'eric@departments.example', region: 'South' },
        { email: 'leo@departments.example', region: 'North' },
        { email: 'nina@departments.example', region: 'North' },
      ]);
      // The seeded password signs in.
      await first.signIn('grace@departments.example', DEMO_PASSWORD);

      // An administrator renames a department; a deliberate replay must keep that.
      await first.organization.updateDepartment('sales-center', {
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
        expect(replayed.assignments).toEqual(seeded.assignments);
        expect(replayed.sharing).toEqual(seeded.sharing);
        expect(replayed.restrictions).toEqual(seeded.restrictions);
        expect(replayed.users).toEqual(seeded.users);
        expect(replayed.members).toEqual(seeded.members);
        expect(replayed.regions).toEqual(seeded.regions);
        expect(replayed.departments).toEqual(
          seeded.departments.map((row) =>
            row.id === 'sales-center'
              ? { ...row, title: 'Sales and marketing' }
              : row,
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
