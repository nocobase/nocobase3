import {
  defineMigration,
  type CollectionDefinitionBuilder,
  type MigrationContext,
  type MigrationDefinition,
} from '@nocobase/app-database';

function timestamps(collection: CollectionDefinitionBuilder): void {
  collection.datetime('createdAt').notNull();
  collection.datetime('updatedAt').notNull();
}

const migration: MigrationDefinition = defineMigration({
  name: '202608220001_create_crm_tables',

  async up({ builder }: MigrationContext): Promise<void> {
    await builder.createCollection('agent_crm_accounts', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 160 }).notNull();
      collection.string('industry', { length: 120 }).nullable();
      collection.string('tier', { length: 32 }).notNull().defaultTo('standard');
      collection
        .string('status', { length: 32 })
        .notNull()
        .defaultTo('prospect');
      collection.string('region', { length: 120 }).nullable();
      collection.string('website', { length: 500 }).nullable();
      collection.string('phone', { length: 64 }).nullable();
      collection.text('notes').nullable();
      timestamps(collection);
      collection.unique('name', { name: 'uq_crm_accounts_name' });
      collection.index('status', { name: 'idx_crm_accounts_status' });
    });

    await builder.createCollection('agent_crm_contacts', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 120 }).notNull();
      collection.string('jobTitle', { length: 120 }).nullable();
      collection.string('decisionRole', { length: 32 }).nullable();
      collection.integer('accountId').notNull();
      collection.string('email', { length: 320 }).nullable();
      collection.string('phone', { length: 64 }).nullable();
      collection.text('notes').nullable();
      timestamps(collection);
      collection.unique('email', { name: 'uq_crm_contacts_email' });
      collection.index('accountId', { name: 'idx_crm_contacts_account' });
    });

    await builder.createCollection('agent_crm_leads', (collection) => {
      collection.increments('id');
      collection.string('code', { length: 32 }).notNull();
      collection.string('name', { length: 120 }).notNull();
      collection.string('company', { length: 160 }).notNull();
      collection.string('status', { length: 32 }).notNull().defaultTo('new');
      collection.string('source', { length: 32 }).nullable();
      collection.integer('score').nullable();
      collection.string('email', { length: 320 }).nullable();
      collection.string('phone', { length: 64 }).nullable();
      collection.string('ownerId', { length: 64 }).nullable();
      collection.text('notes').nullable();
      timestamps(collection);
      collection.unique('code', { name: 'uq_crm_leads_code' });
      collection.unique('email', { name: 'uq_crm_leads_email' });
      collection.index('status', { name: 'idx_crm_leads_status' });
    });

    await builder.createCollection('agent_crm_opportunities', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 180 }).notNull();
      collection.integer('accountId').notNull();
      collection
        .string('stage', { length: 32 })
        .notNull()
        .defaultTo('discovery');
      collection.decimal('amount', { precision: 18, scale: 2 }).notNull();
      collection.integer('probability').nullable();
      collection.datetime('expectedCloseDate').nullable();
      collection.string('nextStep', { length: 255 }).nullable();
      collection.string('ownerId', { length: 64 }).nullable();
      collection.text('notes').nullable();
      timestamps(collection);
      collection.unique('name', { name: 'uq_crm_opportunities_name' });
      collection.index('accountId', { name: 'idx_crm_opportunities_account' });
      collection.index('stage', { name: 'idx_crm_opportunities_stage' });
    });

    await builder.createCollection('agent_crm_activities', (collection) => {
      collection.increments('id');
      collection.string('subject', { length: 180 }).notNull();
      collection.string('type', { length: 32 }).notNull().defaultTo('task');
      collection
        .string('status', { length: 32 })
        .notNull()
        .defaultTo('planned');
      collection.datetime('dueAt').notNull();
      collection.integer('opportunityId').nullable();
      collection.integer('contactId').nullable();
      collection.text('notes').nullable();
      timestamps(collection);
      collection.unique('subject', { name: 'uq_crm_activities_subject' });
      collection.index('status', { name: 'idx_crm_activities_status' });
      collection.index('opportunityId', {
        name: 'idx_crm_activities_opportunity',
      });
      collection.index('contactId', { name: 'idx_crm_activities_contact' });
    });
  },

  async down({ builder }: MigrationContext): Promise<void> {
    await builder.dropCollection('agent_crm_activities');
    await builder.dropCollection('agent_crm_opportunities');
    await builder.dropCollection('agent_crm_leads');
    await builder.dropCollection('agent_crm_contacts');
    await builder.dropCollection('agent_crm_accounts');
  },
});

export default migration;
