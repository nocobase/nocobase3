import { expect, it } from 'vitest';
import type {
  RelationMutationAst,
  SelectAst,
  SelectRelationNode,
  UniqueSelector,
} from '../../../src/index.js';
import {
  describeIntegrationDatabases,
  type IntegrationTestContext,
} from '../helpers.js';

describeIntegrationDatabases('Repository relation mutations', (context) => {
  it('creates a root with connected, created, and nested relation targets', async () => {
    await createMutationFixture(context);
    const repository = context.database.repository('repositoryProjects');

    const created = await repository.createOne({
      values: { name: 'Repository' },
      relations: (relations) =>
        relations
          .set('owner', (owner) => owner.connect({ id: 1 }))
          .set('profile', (profile) => profile.connect({ id: 1 }))
          .patch('tasks', (tasks) =>
            tasks.create(
              { title: 'Implement' },
              {
                clientKey: 'task-local',
                relations: (nested) =>
                  nested.set('assignee', (assignee) =>
                    assignee.connect({ id: 2 }),
                  ),
              },
            ),
          )
          .patch('tags', (tags) =>
            tags
              .connect({ id: 1 })
              .create({ label: 'runtime' }, { clientKey: 'tag-local' }),
          ),
      select: projectSelection(),
    });

    expect(created).toMatchObject({
      record: {
        name: 'Repository',
        owner: { name: 'Ada' },
        profile: { summary: 'Primary project' },
        tasks: [{ title: 'Implement', assignee: { name: 'Bob' } }],
        tags: [{ label: 'database' }, { label: 'runtime' }],
      },
      createdTargets: [
        {
          clientKey: 'task-local',
          collection: 'repositoryTasks',
          unique: { kind: 'unique', fields: ['id'] },
        },
        {
          clientKey: 'tag-local',
          collection: 'repositoryTagsForMutation',
          unique: { kind: 'unique', fields: ['id'] },
        },
      ],
      version: 1,
    });
  });

  it('patches and replaces relations atomically while advancing root version', async () => {
    await createMutationFixture(context);
    const repository = context.database.repository('repositoryProjects');
    const first = await repository.createOne({
      values: { name: 'Repository' },
      relations: (relations) =>
        relations
          .set('owner', (owner) => owner.connect({ id: 1 }))
          .set('profile', (profile) => profile.connect({ id: 1 }))
          .patch('tasks', (tasks) => tasks.connect({ id: 1 }))
          .patch('tags', (tags) => tags.connect({ id: 1 })),
      select: selection(['id']),
    });

    const updated = await repository.updateOne({
      unique: unique('id', first.record.id),
      ifVersion: 1,
      relations: (relations) =>
        relations
          .set('owner', (owner) => owner.connect({ id: 2 }))
          .clear('profile')
          .patch('tasks', (tasks) =>
            tasks.connect({ id: 2 }).disconnect({ id: 1 }),
          )
          .replace('tags', (tags) => tags.connect({ id: 2 })),
      select: projectSelection(),
    });

    expect(updated).toMatchObject({
      record: {
        owner: { name: 'Bob' },
        profile: null,
        tasks: [{ title: 'Review', assignee: null }],
        tags: [{ label: 'typescript' }],
      },
      createdTargets: [],
      version: 2,
    });
    await expect(
      repository.updateOne({
        unique: unique('id', first.record.id),
        ifVersion: 1,
        relations: (relations) =>
          relations.replace('tags', (tags) => tags.connect({ id: 1 })),
      }),
    ).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
    await expect(
      repository.findOne({
        filter: (filter) => filter.number('id').eq(first.record.id as number),
        select: projectSelection(),
      }),
    ).resolves.toMatchObject({
      owner: { name: 'Bob' },
      profile: null,
      tasks: [{ title: 'Review' }],
      tags: [{ label: 'typescript' }],
      version: 2,
    });
  });

  it('rejects implicit reassignment and rolls the complete transaction back', async () => {
    await createMutationFixture(context);
    const repository = context.database.repository('repositoryProjects');
    const first = await repository.createOne({
      values: { name: 'First' },
      relations: (relations) =>
        relations.patch('tasks', (tasks) => tasks.connect({ id: 1 })),
      select: selection(['id']),
    });
    await repository.createOne({
      values: { name: 'Second' },
      relations: (relations) =>
        relations.patch('tasks', (tasks) => tasks.connect({ id: 2 })),
    });

    await expect(
      repository.updateOne({
        unique: unique('id', first.record.id),
        ifVersion: 1,
        values: { name: 'Should roll back' },
        relations: (relations) =>
          relations.patch('tasks', (tasks) => tasks.connect({ id: 2 })),
      }),
    ).rejects.toMatchObject({ code: 'RELATION_REASSIGNMENT_REQUIRED' });
    await expect(
      repository.findOne({
        filter: (filter) => filter.number('id').eq(first.record.id as number),
      }),
    ).resolves.toMatchObject({ name: 'First', version: 1 });
  });

  it('describes and validates executable relation capabilities', async () => {
    await createMutationFixture(context);
    const repository = context.database.repository('repositoryProjects');

    await expect(
      repository.describeMutation({ operation: 'updateOne' }),
    ).resolves.toEqual({
      collection: 'repositoryProjects',
      operation: 'updateOne',
      relations: [
        {
          field: 'owner',
          cardinality: 'one',
          targetCollection: 'repositoryUsers',
          allowedActions: ['set', 'clear'],
          patchOperations: undefined,
          uniqueFieldSets: [{ fields: ['id'], primary: true }],
        },
        {
          field: 'tasks',
          cardinality: 'many',
          targetCollection: 'repositoryTasks',
          allowedActions: ['patch', 'replace'],
          patchOperations: ['connect', 'create', 'disconnect'],
          uniqueFieldSets: [{ fields: ['id'], primary: true }],
        },
        {
          field: 'profile',
          cardinality: 'one',
          targetCollection: 'repositoryProjectProfiles',
          allowedActions: ['set', 'clear'],
          patchOperations: undefined,
          uniqueFieldSets: [{ fields: ['id'], primary: true }],
        },
        {
          field: 'tags',
          cardinality: 'many',
          targetCollection: 'repositoryTagsForMutation',
          allowedActions: ['patch', 'replace'],
          patchOperations: ['connect', 'create', 'disconnect'],
          uniqueFieldSets: [{ fields: ['id'], primary: true }],
        },
      ],
      limits: { maxDepth: 3, maxNodes: 100 },
    });

    const invalid: RelationMutationAst = {
      kind: 'relationMutation',
      version: 1,
      items: [
        {
          kind: 'relation',
          field: 'owner',
          action: 'patch',
          connect: [{ kind: 'connect', by: unique('id', 1) }],
        },
      ],
    };
    await expect(
      repository.validateMutation({
        operation: 'createOne',
        values: { name: 'Invalid' },
        relations: invalid,
      }),
    ).resolves.toMatchObject({
      valid: false,
      errors: [{ code: 'RELATION_ACTION_NOT_ALLOWED', relation: 'owner' }],
    });
  });
});

async function createMutationFixture(
  context: IntegrationTestContext,
): Promise<void> {
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
        collection.integer('projectId').nullable();
        collection.belongsTo('assignee', 'repositoryUsers').constraints(false);
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
        collection.string('label').notNull();
      },
    },
    {
      name: 'repositoryProjectTags',
      definition: (collection) => {
        collection.increments('id');
        collection.integer('projectId').notNull();
        collection.integer('tagId').notNull();
      },
    },
    {
      name: 'repositoryProjects',
      definition: (collection) => {
        collection.increments('id');
        collection.string('name').notNull();
        collection.integer('version').notNull();
        collection.optimisticLock('version');
        collection.belongsTo('owner', 'repositoryUsers').constraints(false);
        collection.hasMany('tasks', 'repositoryTasks').foreignKey('projectId');
        collection
          .hasOne('profile', 'repositoryProjectProfiles')
          .foreignKey('projectId');
        collection
          .belongsToMany('tags', 'repositoryTagsForMutation')
          .through('repositoryProjectTags')
          .foreignKey('projectId')
          .otherKey('tagId');
      },
    },
  ]);
  await context.db(context.table('repositoryUsers')).insert([
    { id: 1, name: 'Ada', email: 'ada@example.com' },
    { id: 2, name: 'Bob', email: 'bob@example.com' },
  ]);
  await context.db(context.table('repositoryProjectProfiles')).insert({
    id: 1,
    summary: 'Primary project',
    project_id: null,
  });
  await context.db(context.table('repositoryTasks')).insert([
    { id: 1, title: 'Implement', project_id: null, assignee_id: 1 },
    { id: 2, title: 'Review', project_id: null, assignee_id: null },
  ]);
  await context.db(context.table('repositoryTagsForMutation')).insert([
    { id: 1, label: 'database' },
    { id: 2, label: 'typescript' },
  ]);
}

function projectSelection(): SelectAst {
  return selection(
    ['id', 'name', 'version'],
    [
      relation('owner', ['name']),
      relation('tasks', ['title'], [relation('assignee', ['name'])]),
      relation('profile', ['summary']),
      relation('tags', ['label']),
    ],
  );
}

function selection(
  fields: readonly string[],
  relations?: readonly SelectRelationNode[],
): SelectAst {
  return {
    kind: 'select',
    version: 1,
    root: { kind: 'selection', fields, relations },
  };
}

function relation(
  field: string,
  fields: readonly string[],
  relations?: readonly SelectRelationNode[],
): SelectRelationNode {
  return {
    kind: 'relation',
    field,
    select: { kind: 'selection', fields, relations },
  };
}

function unique(field: string, value: unknown): UniqueSelector {
  return { kind: 'unique', fields: [field], values: { [field]: value } };
}
