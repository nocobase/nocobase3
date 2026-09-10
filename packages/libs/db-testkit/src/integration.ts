import { afterEach, beforeEach, describe, expect } from 'vitest';
import type {
  DatabaseDialectIntegrationAdapter,
  DatabaseDialectIntegrationContext,
  DatabaseDialectIntegrationSpec,
} from './index.js';

let installedAdapter: DatabaseDialectIntegrationAdapter | undefined;

export function installDatabaseIntegrationAdapter(
  adapter: DatabaseDialectIntegrationAdapter,
): void {
  installedAdapter = adapter;
}

export function getDatabaseIntegrationAdapter(): DatabaseDialectIntegrationAdapter {
  if (!installedAdapter) {
    throw new Error(
      'No database integration adapter is installed. Import a dialect entrypoint before loading integration tests.',
    );
  }
  return installedAdapter;
}

export type IntegrationDatabaseSpec = DatabaseDialectIntegrationSpec;
export type IntegrationTestContext = DatabaseDialectIntegrationContext;

export function describeIntegrationDatabases(
  title: string,
  defineSuite: (context: IntegrationTestContext) => void,
): void {
  const adapter = getDatabaseIntegrationAdapter();
  describe(`${title} [${adapter.name}]`, () => {
    const context = adapter.createContext();
    beforeEach(async () => {
      await adapter.setupContext?.(context);
    });
    afterEach(async () => {
      await adapter.cleanupContext?.(context);
    });
    defineSuite(context);
  });
}

export function useIntegrationDatabase(
  spec: IntegrationDatabaseSpec,
): IntegrationTestContext {
  const adapter = getDatabaseIntegrationAdapter();
  if (adapter.spec.dialect !== spec.dialect) {
    throw new Error(
      `The installed integration adapter is "${adapter.spec.dialect}", not "${spec.dialect}".`,
    );
  }
  const context = adapter.createContext();
  context.spec = spec;
  beforeEach(async () => {
    await adapter.setupContext?.(context);
  });
  afterEach(async () => {
    await adapter.cleanupContext?.(context);
  });
  return context;
}

export async function listIndexes(
  context: IntegrationTestContext,
  tableName: string,
): Promise<Array<Record<string, unknown>>> {
  return getDatabaseIntegrationAdapter().listIndexes(context, tableName);
}

export async function listForeignKeys(
  context: IntegrationTestContext,
  tableName: string,
): Promise<Array<Record<string, unknown>>> {
  return getDatabaseIntegrationAdapter().listForeignKeys(context, tableName);
}

export async function listColumns(
  context: IntegrationTestContext,
  tableName: string,
): Promise<Array<Record<string, unknown>>> {
  return getDatabaseIntegrationAdapter().listColumns(context, tableName);
}

export async function getColumnType(
  context: IntegrationTestContext,
  tableName: string,
  columnName: string,
): Promise<string | undefined> {
  const columns = await listColumns(context, tableName);
  const column = columns.find(
    (row) =>
      String(row.name ?? row.column_name).toLowerCase() ===
      columnName.toLowerCase(),
  );
  return column
    ? String(column.type ?? column.data_type).toLowerCase()
    : undefined;
}

export async function expectForeignKeyViolation(
  action: Promise<unknown>,
): Promise<void> {
  await expect(action).rejects.toThrow(
    /foreign key|integrity constraint|ORA-02291/i,
  );
}

export async function expectUniqueViolation(
  action: Promise<unknown>,
): Promise<void> {
  await expect(action).rejects.toThrow(/unique|duplicate/i);
}
