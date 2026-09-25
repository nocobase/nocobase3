import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609250001_departments_example_create_organization',

  async up({ builder }) {
    await builder.createCollection('departments', (collection) => {
      collection.string('id', { length: 64, nullable: false });
      collection.primary('id');
      collection.string('title', { length: 255, nullable: false });
      collection.string('parentId', { length: 64, nullable: true });
      collection.string('region', { length: 64, nullable: true });
      // The department head: a user id, who need not be a member.
      collection.string('managerId', { length: 64, nullable: true });
      collection.boolean('active', { nullable: false, defaultValue: true });
      collection.integer('sortOrder', { nullable: false, defaultValue: 0 });
      collection.index('parentId');
      collection.index('managerId');
    });
    await builder.createCollection('departmentMembers', (collection) => {
      collection.string('id', { length: 64, nullable: false });
      collection.primary('id');
      collection.string('departmentId', { length: 64, nullable: false });
      collection.string('userId', { length: 64, nullable: false });
      collection.boolean('primary', { nullable: false, defaultValue: false });
      collection.boolean('active', { nullable: false, defaultValue: true });
      collection.unique(['departmentId', 'userId']);
      collection.index('userId');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('departmentMembers');
    await builder.dropCollection('departments');
  },
});

export default migration;
