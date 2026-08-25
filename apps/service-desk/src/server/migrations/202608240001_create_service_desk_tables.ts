import {
  defineMigration,
  type MigrationContext,
  type MigrationDefinition,
} from '@nocobase/app-database';

const migration: MigrationDefinition = defineMigration({
  name: '202608240001_create_service_desk_tables',

  async up({ builder }: MigrationContext): Promise<void> {
    await builder.createCollection('app_service_desk_meta', (collection) => {
      collection.string('key', { length: 64 }).notNull();
      collection.integer('value').notNull();
      collection.primary('key', { name: 'pk_service_desk_meta' });
    });
    await builder.createCollection(
      'app_service_desk_customers',
      (collection) => {
        collection.string('id', { length: 32 }).notNull();
        collection.string('company', { length: 160 }).notNull();
        collection.string('contactName', { length: 120 }).notNull();
        collection.string('phone', { length: 64 }).nullable();
        collection.string('email', { length: 320 }).nullable();
        collection.string('level', { length: 32 }).notNull();
        collection.datetime('createdAt').notNull();
        collection.primary('id', { name: 'pk_service_desk_customers' });
        collection.unique('company', {
          name: 'uq_service_desk_customer_company',
        });
      },
    );
    await builder.createCollection(
      'app_service_desk_services',
      (collection) => {
        collection.string('id', { length: 32 }).notNull();
        collection.string('name', { length: 160 }).notNull();
        collection.string('category', { length: 120 }).notNull();
        collection.string('ownerTeam', { length: 120 }).notNull();
        collection.integer('slaMinutes').notNull();
        collection.string('status', { length: 32 }).notNull();
        collection.primary('id', { name: 'pk_service_desk_services' });
        collection.unique('name', { name: 'uq_service_desk_service_name' });
      },
    );
    await builder.createCollection('app_service_desk_agents', (collection) => {
      collection.string('id', { length: 32 }).notNull();
      collection.string('name', { length: 120 }).notNull();
      collection.string('team', { length: 120 }).notNull();
      collection.string('role', { length: 32 }).notNull();
      collection.string('status', { length: 32 }).notNull();
      collection.primary('id', { name: 'pk_service_desk_agents' });
    });
    await builder.createCollection('app_service_desk_tickets', (collection) => {
      collection.string('id', { length: 32 }).notNull();
      collection.string('ticketNo', { length: 64 }).notNull();
      collection.string('title', { length: 180 }).notNull();
      collection.text('description').nullable();
      collection.string('customerId', { length: 32 }).notNull();
      collection.string('customerName', { length: 160 }).notNull();
      collection.string('serviceId', { length: 32 }).notNull();
      collection.string('serviceName', { length: 160 }).notNull();
      collection.string('priority', { length: 32 }).notNull();
      collection.string('status', { length: 32 }).notNull();
      collection.string('assigneeId', { length: 32 }).nullable();
      collection.string('assigneeName', { length: 120 }).nullable();
      collection.datetime('slaDueAt').notNull();
      collection.datetime('resolvedAt').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_service_desk_tickets' });
      collection.unique('ticketNo', { name: 'uq_service_desk_ticket_no' });
      collection.index('customerId', {
        name: 'idx_service_desk_ticket_customer',
      });
      collection.index('assigneeId', {
        name: 'idx_service_desk_ticket_assignee',
      });
      collection.index('status', { name: 'idx_service_desk_ticket_status' });
      collection.index('slaDueAt', { name: 'idx_service_desk_ticket_sla' });
    });
    await builder.createCollection(
      'app_service_desk_activities',
      (collection) => {
        collection.string('id', { length: 32 }).notNull();
        collection.string('ticketId', { length: 32 }).notNull();
        collection.string('type', { length: 32 }).notNull();
        collection.string('author', { length: 120 }).notNull();
        collection.text('content').notNull();
        collection.datetime('createdAt').notNull();
        collection.primary('id', { name: 'pk_service_desk_activities' });
        collection.index('ticketId', {
          name: 'idx_service_desk_activity_ticket',
        });
        collection.index('createdAt', {
          name: 'idx_service_desk_activity_created',
        });
      },
    );
  },

  async down({ builder }: MigrationContext): Promise<void> {
    await builder.dropCollection('app_service_desk_activities');
    await builder.dropCollection('app_service_desk_tickets');
    await builder.dropCollection('app_service_desk_agents');
    await builder.dropCollection('app_service_desk_services');
    await builder.dropCollection('app_service_desk_customers');
    await builder.dropCollection('app_service_desk_meta');
  },
});

export default migration;
