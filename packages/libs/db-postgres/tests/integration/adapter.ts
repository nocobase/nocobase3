import { createDatabaseManager } from '@nocobase/db';
import {
  createDatabaseIntegrationAdapter,
  dropPortableIntegrationObjects,
  type DatabaseIntegrationAdapter,
  type DatabaseIntegrationProfile,
} from '@nocobase/db-testkit';
import postgres from '../../src/index.js';

export const postgresIntegrationProfile: DatabaseIntegrationProfile = {
  numeric: {
    nativeResults: true,
    supportsInsertReturning: true,
    integerResults: 'number',
    nativeAggregates: true,
    bigintAverage: 'rounded',
    exactProjection: 'castVarchar',
    bigintBinding: 'supported',
    bigintRange: 'full',
    storagePrecision: 'exact',
  },
  character: {
    charRead: 'padded',
    lengthUnit: 'characters',
    collation: true,
    characterSet: true,
  },
  temporal: {
    precisionProbeType: 'timestamp(6) with time zone',
    logicalTypes: {
      day: 'date',
      time: 'time',
      local: 'datetime',
      instant: 'datetimeTz',
    },
    inspectorDataTypes: {
      day: 'date',
      clock: 'time',
      instant: 'datetimeTz',
    },
    fixtureTypes: [
      'date',
      'time(3)',
      'timestamp(3) without time zone',
      'timestamp(6) with time zone',
    ],
    sessionTimezone: 'setConfig',
    instantFilterInput: 'iso',
    isoLiteralFilters: true,
    instantPrimaryKey: true,
  },
  schema: {
    defaultSchema: 'public',
    declareSchema: true,
    supportsSchemas: true,
    uniqueConstraints: true,
    foreignKeyActions: { onDelete: 'restrict', onUpdate: 'cascade' },
    uniqueConstraintDropKeepsIndex: false,
    nativeTextType: 'text',
    comments: 'complete',
    booleanStorage: 'native',
    emptyStringIsNull: false,
    integerResolution: 'integer',
    scalarTypes: ['char(8)', 'varchar(16)', 'integer', 'real', 'boolean'],
    scalarInspection: { quantity: { dataType: 'integer' } },
  },
  json: {
    filters: 'supported',
  },
} satisfies DatabaseIntegrationProfile;

export const postgresIntegrationAdapter: DatabaseIntegrationAdapter =
  createDatabaseIntegrationAdapter({
    name: 'postgres',
    profile: postgresIntegrationProfile,
    createDatabase: (prefix, metadataStore) =>
      createDatabaseManager({
        default: 'main',
        metadataStore,
        connections: {
          main: postgres({
            host:
              process.env.POSTGRES_HOST ?? process.env.PGHOST ?? '127.0.0.1',
            port: Number(
              process.env.POSTGRES_PORT ?? process.env.PGPORT ?? 15432,
            ),
            username:
              process.env.POSTGRES_USER ?? process.env.PGUSER ?? 'nocobase',
            password:
              process.env.POSTGRES_PASSWORD ??
              process.env.PGPASSWORD ??
              'nocobase',
            database:
              process.env.POSTGRES_DATABASE ??
              process.env.PGDATABASE ??
              'nocobase_collection_builder',
            naming: { tablePrefix: `${prefix}_` },
          }),
        },
      }),
    cleanup: async (context) => {
      await dropPortableIntegrationObjects(context, [
        'orderItems',
        'dryRunItems',
        'viewSource',
        'viewRows',
        'keyless',
      ]);
    },
  });
