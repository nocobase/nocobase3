import { defineMigration, type MigrationDefinition } from '@nocobase/db';
const migration: MigrationDefinition = defineMigration({
  name: '202609100001_create_example_daily_reports',
  async up({ builder }) {
    await builder.createCollection('exampleDailyReports', (collection) => {
      collection.string('date', { length: 10 }).primary().notNull();
      collection.integer('impressions').notNull();
      collection.integer('clicks').notNull();
      collection.integer('conversions').notNull();
      collection.integer('spendCents').notNull();
      collection.integer('revenueCents').notNull();
      collection.integer('profitCents').notNull();
    });
  },
  async down({ builder }) {
    await builder.dropCollection('exampleDailyReports');
  },
});
export default migration;
