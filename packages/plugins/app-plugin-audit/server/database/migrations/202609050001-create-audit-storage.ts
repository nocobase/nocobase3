import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609050001-create-audit-storage',
  async up({ builder, connection }): Promise<void> {
    await builder.createCollection('auditEvents', (collection) => {
      collection.tableName('auditEvents');
      collection.text('id', {
        db: {
          nativeType: connection.dialect === 'mysql' ? 'longtext' : 'text',
        },
        columnName: 'id',
        nullable: false,
      });
      collection.integer('eventVersion', {
        columnName: 'eventVersion',
        nullable: false,
      });
      collection.text('kind', {
        db: {
          nativeType: connection.dialect === 'mysql' ? 'longtext' : 'text',
        },
        columnName: 'kind',
        nullable: false,
      });
      collection.text('producer', {
        db: {
          nativeType: connection.dialect === 'mysql' ? 'longtext' : 'text',
        },
        columnName: 'producer',
        nullable: false,
      });
      collection.string('occurredAt', {
        length: 64,
        columnName: 'occurredAt',
        nullable: false,
      });
      collection.string('recordedAt', {
        length: 64,
        columnName: 'recordedAt',
        nullable: false,
      });
      collection.text('action', {
        db: {
          nativeType: connection.dialect === 'mysql' ? 'longtext' : 'text',
        },
        columnName: 'action',
        nullable: false,
      });
      collection.text('outcome', {
        db: {
          nativeType: connection.dialect === 'mysql' ? 'longtext' : 'text',
        },
        columnName: 'outcome',
        nullable: false,
      });
      collection.text('appId', {
        db: {
          nativeType: connection.dialect === 'mysql' ? 'longtext' : 'text',
        },
        columnName: 'appId',
        nullable: false,
      });
      collection.text('securityScope', {
        db: {
          nativeType: connection.dialect === 'mysql' ? 'longtext' : 'text',
        },
        columnName: 'securityScope',
        nullable: false,
      });
      collection.text('store', {
        db: {
          nativeType: connection.dialect === 'mysql' ? 'longtext' : 'text',
        },
        columnName: 'store',
        nullable: false,
      });
      collection.text('actorType', {
        db: {
          nativeType: connection.dialect === 'mysql' ? 'longtext' : 'text',
        },
        columnName: 'actorType',
        nullable: false,
      });
      collection.text('actorId', {
        db: {
          nativeType: connection.dialect === 'mysql' ? 'longtext' : 'text',
        },
        columnName: 'actorId',
        nullable: true,
      });
      collection.text('targetResource', {
        db: {
          nativeType: connection.dialect === 'mysql' ? 'longtext' : 'text',
        },
        columnName: 'targetResource',
        nullable: true,
      });
      collection.string('targetKeyHash', {
        length: 64,
        columnName: 'targetKeyHash',
        nullable: true,
      });
      collection.text('targetKeyEncoding', {
        db: {
          nativeType: connection.dialect === 'mysql' ? 'longtext' : 'text',
        },
        columnName: 'targetKeyEncoding',
        nullable: true,
      });
      collection.text('targetDataSource', {
        db: {
          nativeType: connection.dialect === 'mysql' ? 'longtext' : 'text',
        },
        columnName: 'targetDataSource',
        nullable: true,
      });
      collection.text('operationId', {
        db: {
          nativeType: connection.dialect === 'mysql' ? 'longtext' : 'text',
        },
        columnName: 'operationId',
        nullable: true,
      });
      collection.text('requestId', {
        db: {
          nativeType: connection.dialect === 'mysql' ? 'longtext' : 'text',
        },
        columnName: 'requestId',
        nullable: true,
      });
      collection.text('runId', {
        db: {
          nativeType: connection.dialect === 'mysql' ? 'longtext' : 'text',
        },
        columnName: 'runId',
        nullable: true,
      });
      collection.text('correlationId', {
        db: {
          nativeType: connection.dialect === 'mysql' ? 'longtext' : 'text',
        },
        columnName: 'correlationId',
        nullable: true,
      });
      collection.integer('policyVersion', {
        columnName: 'policyVersion',
        nullable: false,
      });
      collection.string('idempotencyHash', {
        length: 64,
        columnName: 'idempotencyHash',
        nullable: true,
      });
      collection.text('idempotencyScope', {
        db: {
          nativeType: connection.dialect === 'mysql' ? 'longtext' : 'text',
        },
        columnName: 'idempotencyScope',
        nullable: true,
      });
      collection.text('fingerprint', {
        db: {
          nativeType: connection.dialect === 'mysql' ? 'longtext' : 'text',
        },
        columnName: 'fingerprint',
        nullable: false,
      });
      collection.text('payload', {
        db: {
          nativeType: connection.dialect === 'mysql' ? 'longtext' : 'text',
        },
        columnName: 'payload',
        nullable: false,
      });
      collection.string('eventHash', {
        columnName: 'eventHash',
        length: 64,
        nullable: false,
      });
      collection.string('scopeIndex', {
        columnName: 'scopeIndex',
        length: 64,
        nullable: false,
      });
      collection.string('actorIndex', {
        columnName: 'actorIndex',
        length: 64,
        nullable: false,
      });
      collection.string('operationIndex', {
        columnName: 'operationIndex',
        length: 64,
        nullable: true,
      });
      collection.string('requestIndex', {
        columnName: 'requestIndex',
        length: 64,
        nullable: true,
      });
      collection.string('runIndex', {
        columnName: 'runIndex',
        length: 64,
        nullable: true,
      });
      collection.primary('eventHash');
      collection.unique('idempotencyHash', {
        name: 'audit_events_idempotency',
      });
      collection.index(['scopeIndex', 'occurredAt', 'eventHash'], {
        name: 'audit_events_scope_time',
      });
      collection.index(['scopeIndex', 'targetKeyHash', 'occurredAt'], {
        name: 'audit_events_target',
      });
      collection.index(['actorIndex', 'occurredAt'], {
        name: 'audit_events_actor',
      });
      collection.index('operationIndex', { name: 'audit_events_operation' });
      collection.index('requestIndex', { name: 'audit_events_request' });
      collection.index('runIndex', { name: 'audit_events_run' });
    });
    await builder.createCollection('auditSettings', (collection) => {
      collection.tableName('auditSettings');
      collection.string('scopeHash', {
        length: 64,
        columnName: 'scopeHash',
        nullable: false,
      });
      collection.text('appId', {
        db: {
          nativeType: connection.dialect === 'mysql' ? 'longtext' : 'text',
        },
        columnName: 'appId',
        nullable: false,
      });
      collection.text('securityScope', {
        db: {
          nativeType: connection.dialect === 'mysql' ? 'longtext' : 'text',
        },
        columnName: 'securityScope',
        nullable: false,
      });
      collection.integer('revision', {
        columnName: 'revision',
        nullable: false,
      });
      collection.text('settings', {
        db: {
          nativeType: connection.dialect === 'mysql' ? 'longtext' : 'text',
        },
        columnName: 'settings',
        nullable: false,
      });
      collection.primary('scopeHash');
      collection.unique('scopeHash', {
        name: 'audit_settings_scope',
      });
    });
    if (connection.dialect === 'mysql') {
      const client = await connection.client<{
        raw(sql: string): Promise<unknown>;
      }>();
      await client.raw('ALTER TABLE auditEvents ENGINE = InnoDB');
      await client.raw('ALTER TABLE auditSettings ENGINE = InnoDB');
    }
  },
  async down({ builder }): Promise<void> {
    await builder.dropCollection('auditSettings');
    await builder.dropCollection('auditEvents');
  },
});
export default migration;
