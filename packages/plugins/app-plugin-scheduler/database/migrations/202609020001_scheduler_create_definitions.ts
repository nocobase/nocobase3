import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609020001_scheduler_create_definitions',
  async up({ builder, connection }) {
    await builder.createCollection('scheduleSyncLocks', (collection) => {
      collection.string('appName', { primaryKey: true, nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
    });
    await builder.createCollection('scheduleDefinitions', (collection) => {
      collection.string('id', { primaryKey: true, nullable: false });
      collection.string('appName', { nullable: false });
      collection.string('owner', { nullable: false });
      collection.string('key', { nullable: false });
      collection.string('sourceType', { nullable: false });
      collection.string('title', { nullable: false });
      collection.text('description');
      collection.string('definitionHash', { nullable: false });
      collection.string('cron', { nullable: false });
      collection.string('timezone', { nullable: false });
      collection.datetime('fromDate');
      collection.datetime('toDate');
      collection.integer('runLimit');
      collection.boolean('enabled', { nullable: false, defaultValue: true });
      collection.string('targetType', { nullable: false });
      collection.json('targetConfig', { nullable: false });
      collection.string('lifecycleState', {
        nullable: false,
        defaultValue: 'active',
      });
      collection.string('inactiveReason');
      collection.datetime('deactivatedAt');
      collection.string('syncStatus', {
        nullable: false,
        defaultValue: 'synced',
      });
      collection.text('syncError');
      collection.text('lastSeenManifest');
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique(['appName', 'owner', 'key'], { mode: 'index' });
    });
    await builder.createCollection('queueJobs', (collection) => {
      collection.tableName('queue_jobs');
      collection.string('id', { length: 255, nullable: false });
      collection.string('queue', { length: 255, nullable: false });
      collection.string('status', { length: 20, nullable: false });
      collection.text('data', { nullable: false });
      collection.bigInt('score', { unsigned: true });
      collection.string('workerId', { length: 255 });
      collection.bigInt('acquiredAt', { unsigned: true });
      collection.bigInt('executeAt', { unsigned: true });
      collection.bigInt('finishedAt', { unsigned: true });
      collection.text('error');
      collection.string('dedupId', { length: 510 });
      collection.bigInt('dedupAt', { unsigned: true });
      collection.bigInt('dedupTtl', { unsigned: true });
      collection.primary(['id', 'queue'], { name: 'queue_jobs_primary' });
      collection.index(['queue', 'status', 'score'], {
        name: 'queue_jobs_status_score_idx',
      });
      collection.index(['queue', 'status', 'executeAt'], {
        name: 'queue_jobs_status_execute_idx',
      });
      collection.index(['queue', 'status', 'finishedAt'], {
        name: 'queue_jobs_status_finished_idx',
      });
      collection.index(['queue', 'dedupId'], {
        name: 'queue_jobs_queue_dedup_idx',
      });
    });
    if (connection.dialect === 'sqlite' || connection.dialect === 'postgres') {
      const client = await connection.client<{
        raw(sql: string): Promise<unknown>;
      }>();
      await client.raw(
        `CREATE UNIQUE INDEX IF NOT EXISTS "queue_jobs_dedup_active_uidx"
         ON "queue_jobs" ("queue", "dedup_id")
         WHERE "dedup_id" IS NOT NULL
           AND "status" IN ('pending', 'delayed')`,
      );
    }
    await builder.createCollection('queueSchedules', (collection) => {
      collection.tableName('queue_schedules');
      collection.string('id').primary().notNull();
      collection.string('status').notNull().defaultTo('active');
      collection.string('name').notNull();
      collection.text('payload').notNull();
      collection.string('cronExpression');
      collection.bigInt('everyMs');
      collection.string('timezone').notNull().defaultTo('UTC');
      collection.datetime('fromDate');
      collection.datetime('toDate');
      collection.integer('runLimit');
      collection.integer('runCount').notNull().defaultTo(0);
      collection.datetime('nextRunAt');
      collection.datetime('lastRunAt');
      collection.datetime('createdAt').notNull();
      collection.index(['status', 'nextRunAt']);
    });
    await builder.createCollection('scheduleOccurrences', (collection) => {
      collection.string('id', { primaryKey: true, nullable: false });
      collection
        .belongsTo('schedule', 'scheduleDefinitions')
        .foreignKey('scheduleId')
        .foreignKeyType('string')
        .notNull()
        .constraints(true)
        .onDelete('restrict');
      collection.string('definitionHash', { nullable: false });
      collection.datetime('scheduledFor', { nullable: false });
      collection.integer('runNumber', { nullable: false });
      collection.string('status', { nullable: false });
      collection.string('reason');
      collection.string('targetType', { nullable: false });
      collection.string('targetReference');
      collection.json('targetReceipt');
      collection.integer('executionCount', {
        nullable: false,
        defaultValue: 1,
      });
      collection.datetime('startedAt', { nullable: false });
      collection.datetime('lastStartedAt', { nullable: false });
      collection.datetime('finishedAt');
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('scheduleOccurrences');
    await builder.dropCollection('queueSchedules');
    await builder.dropCollection('queueJobs');
    await builder.dropCollection('scheduleDefinitions');
    await builder.dropCollection('scheduleSyncLocks');
  },
});

export default migration;
