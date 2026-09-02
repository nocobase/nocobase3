import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createDatabaseManager,
  createMigrator,
  createSeeder,
  type DatabaseManager,
} from '@nocobase/db';
import type { RunExampleOptions } from '../shared/types.js';
import { createExampleTempDirectory } from '../shared/temp-directory.js';

const migrationName = '202609020001_create_commerce_collections';
const seedName = '202609020002_seed_order_statuses';

export interface ManagedCollectionLifecycleResult {
  readonly name: 'managed';
  readonly migrations: readonly string[];
  readonly seeds: readonly string[];
  readonly metadata: {
    readonly initialRevision: string | number;
    readonly updatedRevision: string | number;
    readonly persistedRevision: string | number;
  };
  readonly resolvedCollection: {
    readonly name: string;
    readonly title?: string;
    readonly relationNames: readonly string[];
    readonly totalAmountTitle?: string;
  };
  readonly statuses: readonly {
    readonly code: unknown;
    readonly title: unknown;
  }[];
  readonly transaction: {
    readonly titleInsideTransaction?: string;
    readonly titleAfterRollback?: string;
  };
  readonly reopened: {
    readonly collectionTitle?: string;
    readonly totalAmountTitle?: string;
  };
  readonly rolledBack: readonly string[];
}

export async function runManagedCollectionLifecycle(
  options: RunExampleOptions = {},
): Promise<ManagedCollectionLifecycleResult> {
  const write = options.write ?? (() => undefined);
  const directory = await createExampleTempDirectory('managed-');
  const filename = path.join(directory, 'example.sqlite');
  let database: DatabaseManager | undefined;

  write('@nocobase/db managed Collection lifecycle');

  try {
    database = createManagedDatabase(filename);
    const migrator = createManagedMigrator(database);
    const migrationResult = await migrator.latest();
    write(`[1/8] Applied migration: ${migrationResult.executed.join(', ')}`);

    const seeder = createManagedSeeder(database);
    const seedResult = await seeder.run();
    write(`[2/8] Applied seed: ${seedResult.executed.join(', ')}`);

    const connection = database.connection();
    const initialMetadata = await connection.collectionMetadata.get('orders');
    if (!initialMetadata) {
      throw new Error('Managed example did not create orders Metadata.');
    }
    write(
      `[3/8] Loaded Database Metadata revision ${String(initialMetadata.revision)}`,
    );

    const initialCollection = await connection.collections.get('orders');
    if (!initialCollection) {
      throw new Error('Managed example did not resolve the orders Collection.');
    }
    await connection.collections.validateRelations('orders');
    write('[4/8] Resolved orders and validated its relation graph');

    const updatedMetadata = await connection.collectionMetadata.updateField(
      'orders',
      'totalAmount',
      {
        title: 'Order total',
        description: 'Total amount before refunds.',
      },
      { expectedRevision: initialMetadata.revision },
    );
    if (!updatedMetadata) {
      throw new Error('Managed example did not update orders Metadata.');
    }
    const updatedCollection = await connection.collections.get('orders');
    write(
      `[5/8] Updated Metadata revision ${String(initialMetadata.revision)} -> ${String(updatedMetadata.revision)}`,
    );

    class ExpectedRollback extends Error {}
    let titleInsideTransaction: string | undefined;
    try {
      await connection.transaction(async (transaction) => {
        await transaction.collectionMetadata.updateCollection(
          'orders',
          { title: 'Temporary orders' },
          { expectedRevision: updatedMetadata.revision },
        );
        titleInsideTransaction = (await transaction.collections.get('orders'))
          ?.title;
        throw new ExpectedRollback();
      });
    } catch (error) {
      if (!(error instanceof ExpectedRollback)) throw error;
    }
    const titleAfterRollback = (await connection.collections.refresh('orders'))
      ?.title;
    write('[6/8] Rolled back a transactional Metadata update');

    await database.destroy();
    database = createManagedDatabase(filename);
    const reopenedConnection = await database.connect();
    const persistedMetadata =
      await reopenedConnection.collectionMetadata.get('orders');
    const reopenedCollection =
      await reopenedConnection.collections.get('orders');
    const statuses = await reopenedConnection.query
      .selectFrom('orderStatuses')
      .select(['code', 'title'])
      .orderBy('code')
      .execute();
    if (!persistedMetadata || !reopenedCollection) {
      throw new Error('Managed example did not persist its Collection state.');
    }
    write('[7/8] Reopened the database and verified persisted state');

    const rollbackResult = await createManagedMigrator(database).rollback();
    if (await reopenedConnection.collections.get('orders')) {
      throw new Error('Managed example Migration rollback left orders behind.');
    }
    write(
      `[8/8] Rolled back migration: ${rollbackResult.rolledBack.join(', ')}`,
    );
    const totalAmount = updatedCollection?.fields?.find(
      (field) => field.name === 'totalAmount',
    );
    const reopenedTotalAmount = reopenedCollection.fields?.find(
      (field) => field.name === 'totalAmount',
    );
    const relationNames = (updatedCollection?.fields ?? [])
      .filter(
        (field) =>
          field.type === 'belongsTo' ||
          field.type === 'hasOne' ||
          field.type === 'hasMany' ||
          field.type === 'belongsToMany',
      )
      .map((field) => field.name);

    return {
      name: 'managed',
      migrations: migrationResult.executed,
      seeds: seedResult.executed,
      metadata: {
        initialRevision: initialMetadata.revision,
        updatedRevision: updatedMetadata.revision,
        persistedRevision: persistedMetadata.revision,
      },
      resolvedCollection: {
        name: updatedCollection?.name ?? initialCollection.name ?? 'orders',
        title: updatedCollection?.title,
        relationNames,
        totalAmountTitle: totalAmount?.title,
      },
      statuses: statuses.map((status) => ({
        code: status.code,
        title: status.title,
      })),
      transaction: { titleInsideTransaction, titleAfterRollback },
      reopened: {
        collectionTitle: reopenedCollection.title,
        totalAmountTitle: reopenedTotalAmount?.title,
      },
      rolledBack: rollbackResult.rolledBack,
    };
  } finally {
    await database?.destroy();
    await rm(directory, { recursive: true, force: true });
  }
}

function createManagedDatabase(filename: string): DatabaseManager {
  return createDatabaseManager({
    default: 'managedExample',
    connections: {
      managedExample: {
        dialect: 'sqlite',
        filename,
        schemaManagement: 'managed',
        naming: { underscored: true, tablePrefix: 'demo_' },
      },
    },
  });
}

function createManagedMigrator(database: DatabaseManager) {
  return createMigrator({
    database,
    packageName: '@nocobase/db-managed-example',
    directory: fileURLToPath(new URL('./database/migrations', import.meta.url)),
  });
}

function createManagedSeeder(database: DatabaseManager) {
  return createSeeder({
    database,
    packageName: '@nocobase/db-managed-example',
    directory: fileURLToPath(new URL('./database/seeds', import.meta.url)),
  });
}

export const managedExampleNames: {
  readonly migration: string;
  readonly seed: string;
} = {
  migration: migrationName,
  seed: seedName,
};
