import { rm } from 'node:fs/promises';
import path from 'node:path';
import knex, { type Knex } from 'knex';
import {
  createDatabaseManager,
  type DatabaseManager,
  ModuleCollectionMetadataStore,
} from '@nocobase/db';
import type { RunExampleOptions } from '../shared/types.js';
import { createExampleTempDirectory } from '../shared/temp-directory.js';
import {
  externalMetadataDocuments,
  externalMetadataSource,
} from './metadata.js';

export interface ExternalModuleMetadataResult {
  readonly name: 'external';
  readonly collection: {
    readonly name: string;
    readonly title?: string;
    readonly relationNames: readonly string[];
  };
  readonly metadataCapabilities: {
    readonly writable: boolean;
    readonly optimisticConcurrency: boolean;
  };
  readonly selectedOrder: {
    readonly orderNo: unknown;
    readonly status: unknown;
  };
  readonly rejectedOperations: {
    readonly schema?: string;
    readonly metadata?: string;
  };
}

export async function runExternalModuleMetadata(
  options: RunExampleOptions = {},
): Promise<ExternalModuleMetadataResult> {
  const write = options.write ?? (() => undefined);
  const directory = await createExampleTempDirectory('external-');
  const filename = path.join(directory, 'external.sqlite');
  let setupClient: Knex | undefined;
  let database: DatabaseManager | undefined;

  write('@nocobase/db external Collection lifecycle');

  try {
    setupClient = knex({
      client: 'better-sqlite3',
      connection: { filename },
      useNullAsDefault: true,
    });
    await createExternalSchema(setupClient);
    await setupClient.destroy();
    setupClient = undefined;
    write('[1/5] Created external CRM physical Schema');

    database = createDatabaseManager({
      default: 'externalExample',
      connections: {
        externalExample: {
          dialect: 'sqlite',
          filename,
          schemaManagement: 'external',
          naming: { underscored: true, tablePrefix: 'crm_' },
          metadataStore: new ModuleCollectionMetadataStore({
            documents: externalMetadataDocuments,
            source: externalMetadataSource,
          }),
        },
      },
    });
    const connection = await database.connect();
    write(
      '[2/5] Connected with external Schema management and Module Metadata',
    );

    const orders = await connection.collections.get('orders');
    if (!orders) {
      throw new Error(
        'External example did not resolve the orders Collection.',
      );
    }
    await connection.collections.validateRelations('orders');
    write('[3/5] Resolved orders and validated its relation graph');

    await connection.query
      .insertInto('customers')
      .values({ email: 'ada@example.com', displayName: 'Ada Lovelace' })
      .execute();
    await connection.query
      .insertInto('orders')
      .values({
        customerId: 1,
        orderNo: 'CRM-1001',
        totalAmount: 125.5,
        status: 'paid',
      })
      .execute();
    const selectedOrder = await connection.query
      .selectFrom('orders')
      .select(['orderNo', 'status'])
      .executeTakeFirstOrThrow();
    write('[4/5] Inserted and selected records through QueryAdapter');

    const rejectedOperations = {
      schema: await expectErrorCode(
        () =>
          connection.builder.createCollection('forbidden', {
            fields: [{ name: 'id', type: 'increments', primaryKey: true }],
          }),
        'SCHEMA_MANAGEMENT_NOT_ALLOWED',
      ),
      metadata: await expectErrorCode(
        () =>
          connection.collectionMetadata.updateCollection('orders', {
            title: 'Changed externally',
          }),
        'METADATA_STORE_READ_ONLY',
      ),
    };
    write('[5/5] Verified Schema and Module Metadata write protection');

    const relationNames = (orders.fields ?? [])
      .filter(
        (field) =>
          field.type === 'belongsTo' ||
          field.type === 'hasOne' ||
          field.type === 'hasMany' ||
          field.type === 'belongsToMany',
      )
      .map((field) => field.name);

    return {
      name: 'external',
      collection: {
        name: orders.name ?? 'orders',
        title: orders.title,
        relationNames,
      },
      metadataCapabilities: connection.collectionMetadata.capabilities,
      selectedOrder: {
        orderNo: selectedOrder.orderNo,
        status: selectedOrder.status,
      },
      rejectedOperations,
    };
  } finally {
    await setupClient?.destroy();
    await database?.destroy();
    await rm(directory, { recursive: true, force: true });
  }
}

async function createExternalSchema(client: Knex): Promise<void> {
  await client.schema.createTable('crm_customers', (table) => {
    table.increments('id');
    table.string('email', 255).notNullable().unique();
    table.string('display_name', 128).notNullable();
  });
  await client.schema.createTable('crm_orders', (table) => {
    table.increments('id');
    table.integer('customer_id').notNullable();
    table.string('order_no', 64).notNullable().unique();
    table.decimal('total_amount', 12, 2).notNullable().defaultTo(0);
    table.string('status', 32).notNullable().defaultTo('draft');
    table.foreign('customer_id').references('id').inTable('crm_customers');
  });
}

function errorCode(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
  ) {
    return error.code;
  }
  throw error;
}

async function expectErrorCode(
  action: () => Promise<unknown>,
  expectedCode: string,
): Promise<string> {
  try {
    await action();
  } catch (error) {
    const code = errorCode(error);
    if (code === expectedCode) return code;
    throw new Error(
      `Expected error code "${expectedCode}", received "${code}".`,
      { cause: error },
    );
  }
  throw new Error(`Expected operation to fail with "${expectedCode}".`);
}
