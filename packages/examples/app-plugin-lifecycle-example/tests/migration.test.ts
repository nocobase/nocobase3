// The migration against a real database: up creates the example records and
// the lifecycle log with their metadata, and down removes all of them.
import path from 'node:path';

import { createDatabaseManager } from '@nocobase/db';
import sqlite from '@nocobase/db-sqlite';
import { expect, it } from 'vitest';

interface SchemaClient {
  readonly schema: {
    hasTable(name: string): Promise<boolean>;
    hasColumn(table: string, column: string): Promise<boolean>;
  };
  raw(sql: string): Promise<readonly { readonly sql: string | null }[]>;
}

const COLLECTIONS: Readonly<Record<string, string>> = {
  lifecycleExampleTickets: 'lifecycle_example_tickets',
  lifecycleExampleExpenses: 'lifecycle_example_expenses',
  lifecycleExampleTransitions: 'lifecycle_example_transitions',
  lifecycleExampleEffectRuns: 'lifecycle_example_effect_runs',
  scenarioLeaveRequests: 'scenario_leave_requests',
  scenarioApprovalRequests: 'scenario_approval_requests',
  scenarioApprovalStages: 'scenario_approval_stages',
  scenarioApprovalTasks: 'scenario_approval_tasks',
  scenarioApprovalLogs: 'scenario_approval_logs',
  scenarioCoordinations: 'scenario_coordinations',
  scenarioWorkItems: 'scenario_work_items',
  scenarioAcknowledgements: 'scenario_acknowledgements',
  scenarioNotices: 'scenario_notices',
  scenarioOrders: 'scenario_orders',
  scenarioSupplierOnboardings: 'scenario_supplier_onboardings',
  scenarioReimbursements: 'scenario_reimbursements',
  scenarioPaymentRequests: 'scenario_payment_requests',
  scenarioAuthorizationRequests: 'scenario_authorization_requests',
  scenarioBudgetGrants: 'scenario_budget_grants',
  scenarioPaymentReservations: 'scenario_payment_reservations',
  scenarioMessages: 'scenario_messages',
  scenarioExternalOperations: 'scenario_external_operations',
  scenarioDemoSettings: 'scenario_demo_settings',
};

it('creates the collections on up and removes them on down', async () => {
  const database = createDatabaseManager({
    default: 'main',
    drivers: { sqlite },
    connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
  });
  try {
    const migrator = database.createMigrator({
      connection: 'main',
      directory: path.resolve(import.meta.dirname, '../database/migrations'),
      packageName: '@nocobase/app-plugin-lifecycle-example',
    });
    await migrator.latest();
    const connection = database.connection('main');
    const client = await connection.client<SchemaClient>();
    for (const [name, physical] of Object.entries(COLLECTIONS)) {
      expect(await client.schema.hasTable(physical)).toBe(true);
      expect(await connection.collectionMetadata.get(name)).toBeDefined();
    }
    for (const physical of [
      'lifecycle_example_tickets',
      'lifecycle_example_expenses',
    ])
      expect(await client.schema.hasColumn(physical, 'lifecycle_version')).toBe(
        true,
      );
    const unique = (
      await client.raw(
        "select sql from sqlite_master where type = 'index' and sql like '%UNIQUE%'",
      )
    )
      .map((row) => row.sql ?? '')
      .join('\n');
    expect(unique).toMatch(
      /lifecycle_example_transitions.*lifecycle.*record_id.*version/,
    );
    // The request key is unique only where there is one.
    expect(unique).toMatch(
      /lifecycle_example_transitions.*request_id[^\n]*where[^\n]*request_id[^\n]*is not null/i,
    );
    // An approval request keeps no stages of its own: they, its to-dos and
    // its handling log are rows, numbered once per request.
    for (const column of ['stages', 'cursor', 'consultations', 'materials'])
      expect(
        await client.schema.hasColumn('scenario_approval_requests', column),
      ).toBe(false);
    for (const table of [
      'scenario_approval_stages',
      'scenario_approval_tasks',
      'scenario_approval_logs',
    ])
      expect(unique).toMatch(new RegExp(`${table}.*request_id.*seq`));
    expect(
      await client.schema.hasColumn('scenario_approval_logs', 'transition_id'),
    ).toBe(true);

    await migrator.rollback();
    for (const [name, physical] of Object.entries(COLLECTIONS)) {
      expect(await client.schema.hasTable(physical)).toBe(false);
      expect(await connection.collectionMetadata.get(name)).toBeUndefined();
    }
  } finally {
    await database.destroy();
  }
});
