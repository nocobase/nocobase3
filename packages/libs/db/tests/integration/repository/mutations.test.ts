import { expect, it } from 'vitest';
import type {
  FilterAst,
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
  it('accepts Builder and JSON relation operations inside values recursively', async () => {
    const fixture = await createMutationFixture(context);
    const repository = context.database.repository('repositoryProjects');

    const created = await repository.createOne({
      values: {
        name: 'Model-shaped create',
        metadata: { connect: 'ordinary JSON data' },
        owner: (owner) => owner.connect({ id: fixture.ada }),
        profile: { connect: { id: fixture.profile } },
        tasks: (tasks) =>
          tasks.create({
            title: 'Nested task',
            assignee: (assignee) => assignee.connect({ id: fixture.bob }),
          }),
        tags: {
          create: { label: 'model-shaped' },
          connect: { id: fixture.databaseTag },
        },
      },
      select: projectSelection(),
    });

    expect(created.record).toMatchObject({
      name: 'Model-shaped create',
      owner: { name: 'Ada' },
      profile: { summary: 'Primary project' },
      tasks: [{ title: 'Nested task', assignee: { name: 'Bob' } }],
      tags: [{ label: 'database' }, { label: 'model-shaped' }],
    });
    expect(
      typeof created.record.metadata === 'string'
        ? JSON.parse(created.record.metadata)
        : created.record.metadata,
    ).toEqual({ connect: 'ordinary JSON data' });
  });

  it('updates relations with mixed JSON and Builder values operations', async () => {
    const fixture = await createMutationFixture(context);
    const repository = context.database.repository('repositoryProjects');
    const first = await repository.createOne({
      values: {
        name: 'Before update',
        owner: { connect: { id: fixture.ada } },
        profile: { connect: { id: fixture.profile } },
        tasks: { connect: { id: fixture.implementTask } },
        tags: { connect: { id: fixture.databaseTag } },
      },
      select: selection(['id']),
    });

    const updated = await repository.updateOne({
      unique: unique('id', first.record.id),
      ifVersion: 1,
      values: {
        name: 'After update',
        owner: { connect: { id: fixture.bob } },
        profile: (profile) => profile.disconnect(),
        tasks: {
          connect: [{ id: fixture.reviewTask }],
          disconnect: [{ id: fixture.implementTask }],
        },
        tags: { set: [{ id: fixture.typescriptTag }] },
      },
      select: projectSelection(),
    });

    expect(updated).toMatchObject({
      record: {
        name: 'After update',
        owner: { name: 'Bob' },
        profile: null,
        tasks: [{ title: 'Review' }],
        tags: [{ label: 'typescript' }],
      },
      version: 2,
    });
  });

  it('rejects conflicting model-shaped relation operations', async () => {
    const fixture = await createMutationFixture(context);
    const repository = context.database.repository('repositoryProjects');

    await expect(
      repository.createOne({
        values: {
          name: 'Conflicting sources',
          owner: { connect: { id: fixture.ada } },
        },
        relations: (relations) =>
          relations.set('owner', (owner) => owner.connect({ id: fixture.bob })),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_MUTATION', relation: 'owner' });

    await expect(
      repository.updateOne({
        unique: unique('id', fixture.implementTask),
        values: {
          tags: (tags) =>
            tags
              .set([{ id: fixture.databaseTag }])
              .connect({ id: fixture.typescriptTag }),
        },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_MUTATION', relation: 'tags' });

    await expect(
      repository.createOne({
        values: {
          name: 'Invalid create',
          tags: { disconnect: true } as never,
        },
      }),
    ).rejects.toMatchObject({ code: 'RELATION_ACTION_NOT_ALLOWED' });
  });

  it('keeps bulk mutation values scalar-only', async () => {
    const fixture = await createMutationFixture(context);
    const repository = context.database.repository('repositoryProjects');

    await expect(
      repository.createMany({
        records: [
          {
            name: 'Invalid bulk create',
            owner: { connect: { id: fixture.ada } } as never,
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'FIELD_NOT_WRITABLE', field: 'owner' });

    await expect(
      repository.updateMany({
        all: true,
        values: {
          tasks: { connect: { id: fixture.implementTask } } as never,
        },
      }),
    ).rejects.toMatchObject({ code: 'FIELD_NOT_WRITABLE', field: 'tasks' });
  });

  it('updates, upserts, and deletes targets inside the current relation scope', async () => {
    const fixture = await createMutationFixture(context);
    const repository = context.database.repository('repositoryProjects');
    const first = await repository.createOne({
      values: {
        name: 'Target mutations',
        profile: { connect: { id: fixture.profile } },
        tasks: {
          connect: [{ id: fixture.implementTask }, { id: fixture.reviewTask }],
        },
        tags: { connect: { id: fixture.databaseTag } },
      },
      select: selection(['id']),
    });

    const updated = await repository.updateOne({
      filter: (filter) => filter.number('id').eq(first.record.id as number),
      values: {
        profile: (profile) =>
          profile.update({ values: { summary: 'Updated profile' } }),
        tasks: (tasks) =>
          tasks
            .update({
              filter: (filter) =>
                filter.number('id').eq(fixture.implementTask as number),
              values: {
                title: 'Implemented',
                assignee: { connect: { id: fixture.bob } },
              },
            })
            .upsert({
              filter: (filter) =>
                filter.string('externalId').eq('task-imported'),
              create: {
                externalId: 'task-imported',
                title: 'Imported task',
              },
              update: { title: 'Updated imported task' },
            })
            .delete({
              filter: (filter) =>
                filter.number('id').eq(fixture.reviewTask as number),
            }),
        tags: {
          update: {
            filter: equalFilter('label', 'database'),
            values: { label: 'database-updated' },
          },
        },
      },
      select: projectSelection(),
    });

    expect(updated.record).toMatchObject({
      profile: { summary: 'Updated profile' },
      tasks: [
        { title: 'Implemented', assignee: { name: 'Bob' } },
        { title: 'Imported task', assignee: null },
      ],
      tags: [{ label: 'database-updated' }],
    });
    await expect(
      context.database.repository('repositoryTasks').findOne({
        filter: (filter) =>
          filter.number('id').eq(fixture.reviewTask as number),
      }),
    ).resolves.toBeUndefined();

    await repository.updateOne({
      filter: (filter) => filter.number('id').eq(first.record.id as number),
      values: {
        tasks: {
          upsert: {
            filter: equalFilter('externalId', 'task-imported'),
            create: {
              externalId: 'task-imported',
              title: 'Should not be created',
            },
            update: { title: 'Updated imported task' },
          },
        },
      },
    });
    const afterUpsert = await repository.findOne({
      filter: (filter) => filter.number('id').eq(first.record.id as number),
      select: projectSelection(),
    });
    expect(afterUpsert?.tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: 'Updated imported task' }),
      ]),
    );

    await expect(
      repository.updateOne({
        filter: (filter) => filter.number('id').eq(first.record.id as number),
        values: {
          tasks: {
            update: {
              filter: (filter) => filter.string('title').notEmpty(),
              values: { title: 'Ambiguous' },
            },
          },
        },
      }),
    ).rejects.toMatchObject({ code: 'MULTIPLE_RELATION_TARGETS_MATCHED' });

    await context.database.repository('repositoryTasks').createOne({
      values: {
        externalId: 'outside-task',
        title: 'Outside relation scope',
      },
    });
    await expect(
      repository.updateOne({
        filter: (filter) => filter.number('id').eq(first.record.id as number),
        values: {
          tasks: {
            upsert: {
              filter: equalFilter('externalId', 'outside-task'),
              create: {
                externalId: 'outside-task',
                title: 'Duplicate outside task',
              },
              update: { title: 'Must stay outside' },
            },
          },
        },
      }),
    ).rejects.toMatchObject({ code: 'RELATION_UPSERT_TARGET_OUTSIDE_SCOPE' });

    await repository.updateOne({
      filter: (filter) => filter.number('id').eq(first.record.id as number),
      values: {
        tags: {
          delete: { filter: equalFilter('label', 'database-updated') },
        },
      },
    });
    await expect(
      context.database.repository('repositoryTagsForMutation').findOne({
        filter: (filter) => filter.string('label').eq('database-updated'),
      }),
    ).resolves.toBeUndefined();
    await expect(
      context.database.repository('repositoryProjectTags').count(),
    ).resolves.toBe(0);

    await repository.updateOne({
      filter: (filter) => filter.number('id').eq(first.record.id as number),
      values: { profile: (profile) => profile.delete() },
    });
    await expect(
      repository.findOne({
        filter: (filter) => filter.number('id').eq(first.record.id as number),
        select: projectSelection(),
      }),
    ).resolves.toMatchObject({ profile: null });
  });

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
          allowedActions: ['set', 'modify', 'clear'],
          modifyOperations: ['update', 'upsert', 'delete'],
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
          modifyOperations: undefined,
          patchOperations: [
            'connect',
            'create',
            'disconnect',
            'update',
            'upsert',
            'delete',
          ],
          uniqueFieldSets: [
            { fields: ['id'], primary: true },
            { fields: ['externalId'], primary: false },
          ],
        },
        {
          field: 'profile',
          cardinality: 'one',
          targetCollection: 'repositoryProjectProfiles',
          allowedActions: ['set', 'modify', 'clear'],
          modifyOperations: ['update', 'upsert', 'delete'],
          patchOperations: undefined,
          uniqueFieldSets: [{ fields: ['id'], primary: true }],
        },
        {
          field: 'tags',
          cardinality: 'many',
          targetCollection: 'repositoryTagsForMutation',
          allowedActions: ['patch', 'replace'],
          modifyOperations: undefined,
          patchOperations: [
            'connect',
            'create',
            'disconnect',
            'update',
            'upsert',
            'delete',
          ],
          uniqueFieldSets: [
            { fields: ['id'], primary: true },
            { fields: ['label'], primary: false },
          ],
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
        collection.string('externalId').nullable().unique();
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
        collection.string('label').notNull().unique();
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
        collection.json('metadata').nullable();
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
    ['id', 'name', 'metadata', 'version'],
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

function equalFilter(field: string, value: string): FilterAst {
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
