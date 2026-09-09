import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609090001_create_analytics',
  async up({ builder }) {
    await builder.createCollections([
      {
        name: 'channels',
        definition: (collection) => {
          collection.string('id', { length: 64 }).primary().notNull();
          collection.string('name', { length: 120 }).notNull();
          collection.string('code', { length: 64 }).notNull();
          collection.unique('code');
          collection
            .hasMany('campaigns', 'campaigns')
            .sourceKey('id')
            .foreignKey('channelId')
            .constraints(false);
        },
      },
      {
        name: 'campaigns',
        definition: (collection) => {
          collection.string('id', { length: 64 }).primary().notNull();
          collection.string('name', { length: 120 }).notNull();
          collection
            .enum('status', { values: ['draft', 'active', 'completed'] })
            .notNull()
            .defaultTo('draft');
          collection.integer('budgetCents').notNull().defaultTo(0);
          collection.string('channelId', { length: 64 }).notNull();
          collection
            .belongsTo('channel', 'channels')
            .targetKey('id')
            .foreignKey('channelId')
            .constraints(true)
            .onDelete('restrict');
          collection
            .hasMany('dailyMetrics', 'dailyMetrics')
            .sourceKey('id')
            .foreignKey('campaignId')
            .constraints(false);
        },
      },
      {
        name: 'dailyMetrics',
        definition: (collection) => {
          collection.string('id', { length: 64 }).primary().notNull();
          // ISO calendar dates keep daily grouping independent of time zones.
          collection.string('date', { length: 10 }).notNull();
          collection.string('campaignId', { length: 64 }).notNull();
          collection.integer('impressions').notNull().defaultTo(0);
          collection.integer('clicks').notNull().defaultTo(0);
          collection.integer('conversions').notNull().defaultTo(0);
          collection.integer('spendCents').notNull().defaultTo(0);
          collection.integer('revenueCents').notNull().defaultTo(0);
          collection.unique(['campaignId', 'date']);
          collection.index('date');
          collection
            .belongsTo('campaign', 'campaigns')
            .targetKey('id')
            .foreignKey('campaignId')
            .constraints(true)
            .onDelete('cascade');
        },
      },
    ]);
  },
  async down({ builder }) {
    await builder.dropCollection('dailyMetrics');
    await builder.dropCollection('campaigns');
    await builder.dropCollection('channels');
  },
});

export default migration;
