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
    const fixture = await createMutationFixture(context);
    const repository = context.database.repository('repositoryProjects');

    const created = await repository.createOne({
      values: { name: 'Repository' },
      relations: (relations) =>
        relations
          .set('owner', (owner) => owner.connect({ id: fixture.ada }))
          .set('profile', (profile) => profile.connect({ id: fixture.profile }))
          .patch('tasks', (tasks) =>
            tasks.create(
              { title: 'Implement' },
              {
                clientKey: 'task-local',
                relations: (nested) =>
                  nested.set('assignee', (assignee) =>
                    assignee.connect({ id: fixture.bob }),
                  ),
              },
            ),
          )
          .patch('tags', (tags) =>
            tags
              .connect({ id: fixture.databaseTag })
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
    const fixture = await createMutationFixture(context);
    const repository = context.database.repository('repositoryProjects');
    const first = await repository.createOne({
      values: { name: 'Repository' },
      relations: (relations) =>
        relations
          .set('owner', (owner) => owner.connect({ id: fixture.ada }))
          .set('profile', (profile) => profile.connect({ id: fixture.profile }))
          .patch('tasks', (tasks) =>
            tasks.connect({ id: fixture.implementTask }),
          )
          .patch('tags', (tags) => tags.connect({ id: fixture.databaseTag })),
      select: selection(['id']),
    });

    const updated = await repository.updateOne({
      unique: unique('id', first.record.id),
      ifVersion: 1,
      relations: (relations) =>
        relations
          .set('owner', (owner) => owner.connect({ id: fixture.bob }))
          .clear('profile')
          .patch('tasks', (tasks) =>
            tasks
              .connect({ id: fixture.reviewTask })
              .disconnect({ id: fixture.implementTask }),
          )
          .replace('tags', (tags) =>
            tags.connect({ id: fixture.typescriptTag }),
          ),
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
          relations.replace('tags', (tags) =>
            tags.connect({ id: fixture.databaseTag }),
          ),
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
    const fixture = await createMutationFixture(context);
    const repository = context.database.repository('repositoryProjects');
    const first = await repository.createOne({
      values: { name: 'First' },
      relations: (relations) =>
        relations.patch('tasks', (tasks) =>
          tasks.connect({ id: fixture.implementTask }),
        ),
      select: selection(['id']),
    });
    await repository.createOne({
      values: { name: 'Second' },
      relations: (relations) =>
        relations.patch('tasks', (tasks) =>
          tasks.connect({ id: fixture.reviewTask }),
        ),
    });

    await expect(
      repository.updateOne({
        unique: unique('id', first.record.id),
        ifVersion: 1,
        values: { name: 'Should roll back' },
        relations: (relations) =>
          relations.patch('tasks', (tasks) =>
            tasks.connect({ id: fixture.reviewTask }),
          ),
      }),
    ).rejects.toMatchObject({ code: 'RELATION_REASSIGNMENT_REQUIRED' });
    await expect(
      repository.findOne({
        filter: (filter) => filter.number('id').eq(first.record.id as number),
      }),
    ).resolves.toMatchObject({ name: 'First', version: 1 });
  });

  it('describes and validates executable relation capabilities', async () => {
    const fixture = await createMutationFixture(context);
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
          uniqueFieldSets: [
            { fields: ['id'], primary: true },
            { fields: ['email'], primary: false },
          ],
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
          connect: [{ kind: 'connect', by: unique('id', fixture.ada) }],
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
    values: { title: 'Implement', projectId: null },
    relations: (relations) =>
      relations.set('assignee', (assignee) =>
        assignee.connect({ id: ada.record.id }),
      ),
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

interface MutationFixtureIds {
  readonly ada: unknown;
  readonly bob: unknown;
  readonly profile: unknown;
  readonly implementTask: unknown;
  readonly reviewTask: unknown;
  readonly databaseTag: unknown;
  readonly typescriptTag: unknown;
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
