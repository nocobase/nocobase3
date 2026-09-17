import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609020001_scheduler_create_definitions',
  async up({ builder }) {
    await builder.createCollection('scheduleSyncLocks', (collection) => {
      collection.string('appName', { primaryKey: true, nullable: false });
      collection.datetimeTz('createdAt', { nullable: false });
      collection.datetimeTz('updatedAt', { nullable: false });
    });
    await builder.createCollection('scheduleDefinitions', (collection) => {
      collection.string('id', { primaryKey: true, nullable: false });
      collection.string('appName', { nullable: false });
      collection.string('key', { nullable: false });
      collection.string('sourceType', { nullable: false });
      collection.string('title', { nullable: false });
      collection.text('description');
      collection.string('definitionHash', { nullable: false });
      collection.string('cron', { nullable: false });
      collection.string('timezone', { nullable: false });
      collection.datetimeTz('fromDate');
      collection.datetimeTz('toDate');
      collection.integer('runLimit');
      collection.boolean('enabled', { nullable: false, defaultValue: true });
      collection.string('targetType', { nullable: false });
      collection.json('targetConfig', { nullable: false });
      collection.string('lifecycleState', {
        nullable: false,
        defaultValue: 'active',
      });
      collection.string('inactiveReason');
      collection.datetimeTz('deactivatedAt');
      collection.string('syncStatus', {
        nullable: false,
        defaultValue: 'synced',
      });
      collection.text('syncError');
      collection.text('lastSeenManifest');
      collection.datetimeTz('createdAt', { nullable: false });
      collection.datetimeTz('updatedAt', { nullable: false });
      collection.unique(['appName', 'key'], { mode: 'index' });
    });
    await builder.createCollection('scheduleOccurrences', (collection) => {
      collection.string('id', { primaryKey: true, nullable: false });
      collection
        .belongsTo('schedule', 'scheduleDefinitions')
        .targetKey('id')
        .foreignKey('scheduleId')
        .foreignKeyType('string')
        .notNull()
        .constraints(true)
        .onDelete('restrict');
      collection.string('definitionHash', { nullable: false });
      collection.string('status', { nullable: false });
      collection.string('reason');
      collection.string('targetType', { nullable: false });
      collection.json('targetReceipt');
      collection.string('targetReferenceType');
      collection.string('targetReferenceId');
      collection.json('resultSummary');
      collection.integer('executionCount', {
        nullable: false,
        defaultValue: 1,
      });
      collection.datetimeTz('startedAt', { nullable: false });
      collection.datetimeTz('lastStartedAt', { nullable: false });
      collection.datetimeTz('acceptedAt');
      collection.datetimeTz('lastObservedAt');
      collection.datetimeTz('observationDeadlineAt');
      collection.datetimeTz('finishedAt');
      collection.datetimeTz('createdAt', { nullable: false });
      collection.datetimeTz('updatedAt', { nullable: false });
      collection.index(['targetReferenceType', 'targetReferenceId'], {
        name: 'schedule_occurrences_target_reference_idx',
      });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('scheduleOccurrences');
    await builder.dropCollection('scheduleDefinitions');
    await builder.dropCollection('scheduleSyncLocks');
  },
});

export default migration;
