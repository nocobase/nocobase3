import { describe, expect, it } from 'vitest';
import {
  describeIntegrationDatabases,
  useIntegrationDatabase,
} from '../helpers.js';

describeIntegrationDatabases('capability warnings', (context) => {
  it('downgrades safe unsupported capabilities without failing real DDL', async () => {
    const result = await context.builder.createCollection(
      'capabilityEvents',
      (collection) => {
        if (context.spec.dialect !== 'oracle') {
          collection.dbSchema(
            context.spec.dialect === 'mssql' ? 'dbo' : 'public',
          );
        }
        collection.increments('id');
        collection.native(
          'ipAddress',
          context.spec.dialect === 'oracle' ? 'clob' : 'text',
          {
            db: {
              comment: 'Client IP address',
            },
          },
        );
        collection.string('email');
        collection.unique('email', {
          deferrable: 'deferred',
        });
      },
    );

    expect(
      await context.db.schema.hasTable(context.table('capabilityEvents')),
    ).toBe(true);
    expect(
      await context.db.schema.hasColumn(
        context.table('capabilityEvents'),
        'ip_address',
      ),
    ).toBe(true);

    if (
      context.spec.dialect === 'postgres' ||
      context.spec.dialect === 'oracle'
    ) {
      expect(result.warnings).toEqual([]);
    } else if (context.spec.dialect === 'mssql') {
      expect(result.warnings?.map((warning) => warning.code)).toEqual([
        'UNSUPPORTED_DEFERRABLE_CONSTRAINT',
      ]);
    } else {
      expect(result.warnings?.map((warning) => warning.code)).toEqual(
        expect.arrayContaining([
          'UNSUPPORTED_SCHEMA',
          'UNSUPPORTED_DEFERRABLE_CONSTRAINT',
        ]),
      );
    }

    if (context.spec.dialect === 'sqlite') {
      expect(result.warnings?.map((warning) => warning.code)).toEqual(
        expect.arrayContaining([
          'UNSUPPORTED_NATIVE_TYPE',
          'UNSUPPORTED_COMMENT',
        ]),
      );
    }
  });

  it('handles partial unique constraints according to dialect capability', async () => {
    const result = await context.builder.createCollection(
      'partialUniqueJobs',
      (collection) => {
        collection.increments('id');
        collection.integer('accountId');
        collection.integer('programId');
        collection.unique(['accountId', 'programId'], {
          name: context.identifier('uk_partial_unique_jobs_account_program'),
          predicate: {
            accountId: { $notNull: true },
          },
        });
      },
    );

    expect(
      await context.db.schema.hasTable(context.table('partialUniqueJobs')),
    ).toBe(true);

    if (!context.database.connection().capabilities.partialIndexes) {
      expect(result.warnings).toEqual([
        expect.objectContaining({
          code: 'UNSUPPORTED_PARTIAL_UNIQUE_CONSTRAINT',
          severity: 'unsafe',
          fallback: 'skip',
        }),
      ]);

      await context.db(context.table('partialUniqueJobs')).insert({
        account_id: 1,
        program_id: 1,
      });
      await expect(
        context.db(context.table('partialUniqueJobs')).insert({
          account_id: 1,
          program_id: 1,
        }),
      ).resolves.toBeDefined();
    } else {
      expect(result.warnings).toEqual([]);

      await context.db(context.table('partialUniqueJobs')).insert({
        account_id: null,
        program_id: 1,
      });
      await context.db(context.table('partialUniqueJobs')).insert({
        account_id: null,
        program_id: 1,
      });
      await context.db(context.table('partialUniqueJobs')).insert({
        account_id: 1,
        program_id: 1,
      });
      await expect(
        context.db(context.table('partialUniqueJobs')).insert({
          account_id: 1,
          program_id: 1,
        }),
      ).rejects.toThrow(/unique|duplicate/i);
    }
  });
});

describe('capability warnings [sqlite materialized view]', () => {
  const context = useIntegrationDatabase({
    name: 'sqlite',
    dialect: 'sqlite',
    filename: ':memory:',
  });

  it('warns and skips unsupported materialized views without throwing', async () => {
    const result = await context.builder.createMaterializedViewCollection(
      'usersSnapshot',
      (view) => {
        view.string('email');
        view.as((query) => query.from('users').select('email'));
      },
    );

    expect(result.warnings).toEqual([
      expect.objectContaining({
        code: 'UNSUPPORTED_MATERIALIZED_VIEW',
        severity: 'unsafe',
        fallback: 'skip',
      }),
    ]);
    expect(result.schemaOperations).toEqual([]);
    expect(
      await context.db.schema.hasTable(context.table('usersSnapshot')),
    ).toBe(false);
  });
});
