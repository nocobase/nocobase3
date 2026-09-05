import type {
  FilterAst,
  SelectAst,
  SelectIncludeNode,
} from '../../../../src/index.js';
import { type IntegrationTestContext } from '../../helpers.js';

export async function createMutationFixture(
  context: IntegrationTestContext,
): Promise<MutationFixtureIds> {
  await context.builder.createCollections([
    {
      name: 'repositoryUsers',
      definition: (collection) => {
        collection.increments('id');
        collection.string('name').notNull();
        collection.string('email').notNull().unique();
      },
    },
    {
      name: 'repositoryTasks',
      definition: (collection) => {
        collection.increments('id');
        collection.string('title').notNull();
        collection.integer('points').notNull().defaultTo(0);
        collection.string('externalId').nullable().unique();
        collection.integer('projectId').nullable();
        collection
          .belongsTo('assignee', 'repositoryUsers')
          .targetKey('id')
          .foreignKey('assigneeId')
          .foreignKeyType('bigInt')
          .constraints(false);
      },
    },
    {
      name: 'repositoryProjectProfiles',
      definition: (collection) => {
        collection.increments('id');
        collection.string('summary').notNull();
        collection.integer('projectId').nullable();
      },
    },
    {
      name: 'repositoryTagsForMutation',
      definition: (collection) => {
        collection.increments('id');
        collection.string('label').notNull().unique();
      },
    },
    {
      name: 'repositoryProjectTags',
      definition: (collection) => {
        collection.increments('id');
        collection.integer('projectId').notNull();
        collection.integer('tagId').notNull();
        collection.string('role').nullable();
        collection.integer('weight').notNull().defaultTo(0);
      },
    },
    {
      name: 'repositoryProjects',
      definition: (collection) => {
        collection.increments('id');
        collection.string('externalId').nullable().unique();
        collection.string('name').notNull();
        collection.json('metadata').nullable();
        collection.integer('version').notNull();
        collection.optimisticLock('version');
        collection
          .belongsTo('owner', 'repositoryUsers')
          .targetKey('id')
          .foreignKey('ownerId')
          .foreignKeyType('bigInt')
          .constraints(false);
        collection
          .hasMany('tasks', 'repositoryTasks')
          .sourceKey('id')
          .foreignKey('projectId');
        collection
          .hasOne('profile', 'repositoryProjectProfiles')
          .sourceKey('id')
          .foreignKey('projectId');
        collection
          .belongsToMany('tags', 'repositoryTagsForMutation')
          .sourceKey('id')
          .targetKey('id')
          .through('repositoryProjectTags')
          .foreignKey('projectId')
          .otherKey('tagId');
      },
    },
  ]);
  const users = context.database.repository('repositoryUsers');
  const profiles = context.database.repository('repositoryProjectProfiles');
  const tasks = context.database.repository('repositoryTasks');
  const tags = context.database.repository('repositoryTagsForMutation');
  const ada = await users.createOne({
    values: { name: 'Ada', email: 'ada@example.com' },
    select: selection(['id']),
  });
  const bob = await users.createOne({
    values: { name: 'Bob', email: 'bob@example.com' },
    select: selection(['id']),
  });
  const profile = await profiles.createOne({
    values: { summary: 'Primary project', projectId: null },
    select: selection(['id']),
  });
  const implementTask = await tasks.createOne({
    values: {
      title: 'Implement',
      projectId: null,
      assignee: { connect: { id: ada.record.id } },
    },
    select: selection(['id']),
  });
  const reviewTask = await tasks.createOne({
    values: { title: 'Review', projectId: null },
    select: selection(['id']),
  });
  const databaseTag = await tags.createOne({
    values: { label: 'database' },
    select: selection(['id']),
  });
  const typescriptTag = await tags.createOne({
    values: { label: 'typescript' },
    select: selection(['id']),
  });
  return {
    ada: ada.record.id,
    bob: bob.record.id,
    profile: profile.record.id,
    implementTask: implementTask.record.id,
    reviewTask: reviewTask.record.id,
    databaseTag: databaseTag.record.id,
    typescriptTag: typescriptTag.record.id,
  };
}

export interface MutationFixtureIds {
  readonly ada: unknown;
  readonly bob: unknown;
  readonly profile: unknown;
  readonly implementTask: unknown;
  readonly reviewTask: unknown;
  readonly databaseTag: unknown;
  readonly typescriptTag: unknown;
}

export function projectSelection(): SelectAst {
  return selection(
    ['id', 'name', 'metadata', 'version'],
    [
      relation('owner', ['name']),
      relation('tasks', ['title'], [relation('assignee', ['name'])]),
      relation('profile', ['summary']),
      relation('tags', ['label']),
    ],
  );
}

export function selection(
  fields: readonly string[],
  includes?: readonly SelectIncludeNode[],
): SelectAst {
  return {
    kind: 'select',
    version: 1,
    root: { kind: 'selection', fields, includes },
  };
}

export function relation(
  relation: string,
  fields: readonly string[],
  includes?: readonly SelectIncludeNode[],
): SelectIncludeNode {
  return {
    kind: 'include',
    relation,
    select: { kind: 'selection', fields, includes },
  };
}

export function equalFilter(field: string, value: string): FilterAst {
  return {
    kind: 'filter',
    version: 1,
    root: {
      kind: 'group',
      logic: 'and',
      items: [{ kind: 'condition', path: [field], operator: '$eq', value }],
    },
  };
}
