import { defineCollectionMetadata } from '../../../src/index.js';
import type { PhysicalCollectionSchema } from '../../../src/schema/inspector/types.js';
import type {
  ResolverFailureFixture,
  ResolverSuccessFixture,
} from './types.js';

const completeInspection: PhysicalCollectionSchema['inspection'] = {
  aspects: {
    columns: 'complete',
    primaryKey: 'complete',
    uniqueConstraints: 'complete',
    indexes: 'complete',
    foreignKeys: 'complete',
    checkConstraints: 'complete',
    comments: 'complete',
    viewDefinition: 'complete',
  },
  warnings: [],
};

const ordersPhysicalSchema: PhysicalCollectionSchema = {
  schema: 'sales',
  tableName: 'app_orders',
  kind: 'table',
  columns: [
    {
      columnName: 'id',
      ordinalPosition: 1,
      dataType: 'bigInt',
      nativeType: 'bigint',
      nullable: false,
      autoIncrement: true,
    },
    {
      columnName: 'amount',
      ordinalPosition: 2,
      dataType: 'decimal',
      nativeType: 'numeric(12,2)',
      nullable: false,
      autoIncrement: false,
      precision: 12,
      scale: 2,
      default: { expression: '0', value: 0 },
    },
    {
      columnName: 'status',
      ordinalPosition: 3,
      dataType: 'string',
      nativeType: 'varchar(32)',
      nullable: false,
      autoIncrement: false,
      length: 32,
    },
  ],
  primaryKey: { name: 'orders_pkey', columns: ['id'] },
  uniqueConstraints: [],
  indexes: [
    {
      name: 'orders_status_idx',
      keys: [{ columnName: 'status', order: 'asc' }],
      unique: false,
    },
  ],
  foreignKeys: [],
  checkConstraints: [],
  inspection: completeInspection,
};

export const ordersResolverFixture: ResolverSuccessFixture = {
  name: 'resolves physical facts with supplemental Metadata',
  physical: ordersPhysicalSchema,
  metadata: defineCollectionMetadata({
    version: 1,
    name: 'orders',
    naming: { tablePrefix: 'app_' },
    title: 'Orders',
    description: 'Customer purchase orders.',
    fields: {
      amount: {
        title: 'Order amount',
        description: 'Total amount before refunds.',
      },
    },
  }),
  naming: { underscored: true },
  expected: {
    name: 'orders',
    kind: 'table',
    naming: { underscored: true, tablePrefix: 'app_' },
    title: 'Orders',
    description: 'Customer purchase orders.',
    db: { schema: 'sales' },
  },
};

export const missingFieldDriftFixture: ResolverFailureFixture = {
  name: 'reports Metadata that references a missing physical Field',
  physical: {
    ...ordersPhysicalSchema,
    tableName: 'orders',
  },
  metadata: defineCollectionMetadata({
    version: 1,
    name: 'orders',
    fields: {
      legacyCode: { title: 'Legacy code' },
    },
  }),
  expectedIssues: [
    {
      code: 'COLLECTION_SCHEMA_DRIFT',
      path: ['metadata', 'fields', 'legacyCode'],
    },
  ],
};
