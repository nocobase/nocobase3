import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609060004_repository_example_relation_mutations',
  async up({ builder }) {
    await builder.createCollections([
      {
        name: 'repositoryExampleRelationUsers',
        definition: (collection) => {
          collection.string('id', { length: 64 }).primary().notNull();
          collection.string('name', { length: 120 }).notNull();
          collection.string('email', { length: 255 }).unique().notNull();
        },
      },
      {
        name: 'repositoryExampleRelationProjectProfiles',
        definition: (collection) => {
          collection.string('id', { length: 64 }).primary().notNull();
          collection.string('summary', { length: 255 }).notNull();
          collection.string('projectId', { length: 64 }).nullable();
          collection.unique(['projectId']);
        },
      },
      {
        name: 'repositoryExampleRelationTasks',
        definition: (collection) => {
          collection.string('id', { length: 64 }).primary().notNull();
          collection.string('title', { length: 160 }).notNull();
          collection
            .string('status', { length: 32 })
            .notNull()
            .defaultTo('draft');
          collection.integer('points').notNull().defaultTo(0);
          collection.string('projectId', { length: 64 }).nullable();
          collection.string('assigneeId', { length: 64 }).nullable();
          collection
            .belongsTo('assignee', 'repositoryExampleRelationUsers')
            .targetKey('id')
            .foreignKey('assigneeId')
            .constraints(false);
        },
      },
      {
        name: 'repositoryExampleRelationTags',
        definition: (collection) => {
          collection.string('id', { length: 64 }).primary().notNull();
          collection.string('label', { length: 120 }).unique().notNull();
        },
      },
      {
        name: 'repositoryExampleRelationProjectTags',
        definition: (collection) => {
          collection.string('projectId', { length: 64 }).notNull();
          collection.string('tagId', { length: 64 }).notNull();
          collection.string('role', { length: 64 }).nullable();
          collection.unique(['projectId', 'tagId']);
        },
      },
      {
        name: 'repositoryExampleRelationProjects',
        definition: (collection) => {
          collection.string('id', { length: 64 }).primary().notNull();
          collection.string('name', { length: 160 }).notNull();
          collection
            .string('status', { length: 32 })
            .notNull()
            .defaultTo('draft');
          collection.string('ownerId', { length: 64 }).nullable();
          collection
            .belongsTo('owner', 'repositoryExampleRelationUsers')
            .targetKey('id')
            .foreignKey('ownerId')
            .constraints(false);
          collection
            .hasOne('profile', 'repositoryExampleRelationProjectProfiles')
            .sourceKey('id')
            .foreignKey('projectId')
            .constraints(false);
          collection
            .hasMany('tasks', 'repositoryExampleRelationTasks')
            .sourceKey('id')
            .foreignKey('projectId')
            .constraints(false);
          collection
            .belongsToMany('tags', 'repositoryExampleRelationTags')
            .sourceKey('id')
            .targetKey('id')
            .through('repositoryExampleRelationProjectTags')
            .foreignKey('projectId')
            .otherKey('tagId')
            .constraints(false);
        },
      },
    ]);
  },
  async down({ builder }) {
    await builder.dropCollection('repositoryExampleRelationProjects');
    await builder.dropCollection('repositoryExampleRelationProjectTags');
    await builder.dropCollection('repositoryExampleRelationTasks');
    await builder.dropCollection('repositoryExampleRelationProjectProfiles');
    await builder.dropCollection('repositoryExampleRelationTags');
    await builder.dropCollection('repositoryExampleRelationUsers');
  },
});

export default migration;
