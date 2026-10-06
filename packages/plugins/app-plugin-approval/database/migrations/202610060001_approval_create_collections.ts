import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The approval layer's three collections: runs, the tasks of each stay in a
 * stage, and the log of what happened to them. They hold nothing of one
 * business; a business record is referred to by its lifecycle name and id.
 *
 * A run is a lifecycle record of its own, so it carries a state, the instant
 * it changed and a version. References between the three are kept as
 * strings, the way the layer and the lifecycle log pass ids.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610060001_approval_create_collections',

  async up({ builder }) {
    await builder.createCollection('approvalRuns', (table) => {
      table.bigInt('id').primary().autoIncrement().notNull();
      // The approval definition the run belongs to.
      table.string('source').notNull();
      // The business record the run decides.
      table.string('lifecycle').notNull();
      table.string('recordId').notNull();
      table.string('applicantId').notNull();
      // The rule version the run was planned under.
      table.integer('version').notNull();
      // The stage the run waits in, then how it ended.
      table.string('status').notNull();
      table.datetimeTz('statusChangedAt').notNull();
      table.integer('lifecycleVersion').notNull().defaultTo(0);
      table.json('plan').notNull().defaultTo([]);
      table.json('settings').notNull().defaultTo({});
      table.json('parameters').notNull().defaultTo({});
      table.string('outcome');
      table.json('submitted').notNull().defaultTo({});
      table.json('changes').notNull().defaultTo([]);
      table.json('content').notNull().defaultTo({});
      table.string('contentHash').notNull();
      table.string('previousRunId');
      table.string('resumeAt');
      table.json('returnedBy');
      table.datetimeTz('startedAt').notNull();
      table.string('startedBy').notNull();
      table.datetimeTz('endedAt');
      table.string('endedBy');
      table.string('endedWith');
      table.text('note');
      // The last answer number given out in the run.
      table.integer('sequence').notNull().defaultTo(0);
      table.integer('rowVersion').notNull().defaultTo(0);
      table.index(['lifecycle', 'recordId', 'id']);
      table.index(['status', 'statusChangedAt']);
    });

    await builder.createCollection('approvalTasks', (table) => {
      table.bigInt('id').primary().autoIncrement().notNull();
      table.string('source').notNull();
      table.string('lifecycle').notNull();
      table.string('recordId').notNull();
      table.string('runId').notNull();
      // The stay the task belongs to: a stage, and the run version it began at.
      table.string('stage').notNull();
      table.integer('enteredVersion').notNull();
      table.string('kind').notNull();
      table.string('role').notNull();
      table.string('mode');
      table.string('gates');
      table.integer('depth').notNull().defaultTo(0);
      table.integer('order').notNull().defaultTo(0);
      table.string('subject');
      table.string('assigneeId').notNull();
      table.string('via').notNull();
      table.text('note');
      table.string('previousTaskId');
      table.string('status').notNull();
      table.string('answer');
      table.text('comment');
      table.json('data');
      table.string('actorId');
      table.string('contentHash');
      table.string('requestId');
      table.datetimeTz('createdAt').notNull();
      table.datetimeTz('claimedAt');
      table.datetimeTz('remindAt');
      table.datetimeTz('dueAt');
      table.datetimeTz('closedAt');
      table.string('closeReason');
      table.integer('seq');
      table.integer('rowVersion').notNull().defaultTo(0);
      table.index(['runId', 'stage', 'enteredVersion']);
      table.index(['lifecycle', 'recordId', 'id']);
      // A person's to-do list.
      table.index(['assigneeId', 'status']);
      table.index(['status', 'dueAt']);
    });

    await builder.createCollection('approvalEvents', (table) => {
      table.bigInt('id').primary().autoIncrement().notNull();
      table.string('runId').notNull();
      table.string('source').notNull();
      table.string('lifecycle').notNull();
      table.string('recordId').notNull();
      table.string('stage');
      table.string('taskId');
      table.string('kind').notNull();
      table.string('actorId').notNull();
      table.text('message');
      table.json('data').notNull().defaultTo({});
      table.datetimeTz('at').notNull();
      table.index(['runId', 'id']);
      table.index(['lifecycle', 'recordId', 'id']);
    });
  },

  async down({ builder }) {
    await builder.dropCollection('approvalEvents');
    await builder.dropCollection('approvalTasks');
    await builder.dropCollection('approvalRuns');
  },
});

export default migration;
