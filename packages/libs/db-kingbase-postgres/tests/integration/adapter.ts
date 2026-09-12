import { createDatabaseManager } from '@nocobase/db';
import {
  createDatabaseIntegrationAdapter,
  dropPortableIntegrationObjects,
  type DatabaseIntegrationAdapter,
  type DatabaseIntegrationProfile,
} from '@nocobase/db-testkit';
import kingbasePostgres from '../../src/index.js';

export const kingbasePostgresIntegrationProfile: DatabaseIntegrationProfile = {
  numeric: {
    nativeResults: true,
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
  },
  json: {
    filters: 'supported',
  },
} satisfies DatabaseIntegrationProfile;

export const kingbasePostgresIntegrationAdapter: DatabaseIntegrationAdapter =
  createDatabaseIntegrationAdapter({
    name: 'kingbase-postgres',
    profile: kingbasePostgresIntegrationProfile,
    createDatabase: (prefix, metadataStore) =>
      createDatabaseManager({
        default: 'main',
        metadataStore,
        connections: {
          main: kingbasePostgres({
            host:
              process.env.KINGBASE_POSTGRES_HOST ??
              process.env.PGHOST ??
              '127.0.0.1',
            port: Number(
              process.env.KINGBASE_POSTGRES_PORT ?? process.env.PGPORT ?? 54321,
            ),
            username:
              process.env.KINGBASE_POSTGRES_USER ??
              process.env.PGUSER ??
              'nocobase',
            password:
              process.env.KINGBASE_POSTGRES_PASSWORD ??
              process.env.PGPASSWORD ??
              'nocobase',
            database:
              process.env.KINGBASE_POSTGRES_DATABASE ??
              process.env.PGDATABASE ??
              'test',
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
