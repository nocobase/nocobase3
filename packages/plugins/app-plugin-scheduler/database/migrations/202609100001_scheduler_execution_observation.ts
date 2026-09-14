import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609100001_scheduler_execution_observation',
  async up({ builder }) {
    await builder.alterCollection('scheduleOccurrences', (collection) => {
      collection.string('targetReferenceType');
      collection.string('targetReferenceId');
      collection.json('resultSummary');
      collection.datetime('acceptedAt');
      collection.datetime('lastObservedAt');
      collection.datetime('observationDeadlineAt');
      collection.index(['targetReferenceType', 'targetReferenceId'], {
        name: 'schedule_occurrences_target_reference_idx',
      });
    });
  },
  async down({ builder }) {
    await builder.alterCollection('scheduleOccurrences', (collection) => {
      collection.dropField('targetReferenceType');
      collection.dropField('targetReferenceId');
      collection.dropField('resultSummary');
      collection.dropField('acceptedAt');
      collection.dropField('lastObservedAt');
      collection.dropField('observationDeadlineAt');
    });
  },
});

export default migration;
