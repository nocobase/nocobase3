import { expect, it, vi } from 'vitest';
import {
  buildWritePolicy,
  buildUpsertWritePolicy,
  type WritePolicyBuilder,
  type RelationCreateWritePolicyBuilder,
  type FieldWritePolicyInput,
  type WritePolicyInput,
} from '../../../../src/index.js';
import { describeIntegrationDatabases } from '../../helpers.js';
import { createMutationFixture } from '../fixtures/mutations.js';

describeIntegrationDatabases('Repository write policy', (context) => {
  it('defaults to true internally, preserves JSON and numeric operations, and keeps schema constraints', async () => {
    const fixture = await createMutationFixture(context);
    const projects = context.database.repository('repositoryProjects');
    const created = await projects.createOne({
      values: {
        name: 'Original',
        owner: { connect: { id: fixture.ada } },
        tasks: { create: { title: 'Task' } },
      },
    });
    await projects.updateOne({
      filter: { id: created.record.id as number },
      values: { name: 'Updated' },
      writePolicy: true,
    });
    await projects.updateOne({
      filter: { id: created.record.id as number },
      writePolicy: { fields: ['metadata'] },
      values: { metadata: { update: { name: 'ordinary JSON' } } },
    });
    await expect(
      projects.createOne({
        writePolicy: true,
        values: { name: 'Invalid', version: 99 },
      }),
    ).rejects.toMatchObject({ code: 'FIELD_NOT_WRITABLE' });
    expect(await projects.count()).toBe(1);
  });

  it('false rejects all scalar and empty mutations before callbacks or writes, including bulk and preflight', async () => {
    await createMutationFixture(context);
    const projects = context.database.repository('repositoryProjects');
    const values = vi.fn(() => ({ name: 'Denied' }));
    await expect(
      projects.createOne({ writePolicy: false, values }),
    ).rejects.toMatchObject({ code: 'WRITE_FORBIDDEN' });
    expect(values).not.toHaveBeenCalled();
    await expect(
      projects.createOne({ writePolicy: false, values: {} }),
    ).rejects.toMatchObject({ code: 'WRITE_FORBIDDEN' });
    await expect(
      projects.updateOne({ writePolicy: false, filter: { id: 1 }, values: {} }),
    ).rejects.toMatchObject({ code: 'WRITE_FORBIDDEN' });
    await expect(
      projects.upsertOne({
        writePolicy: false,
        filter: { externalId: 'new' },
        create: { externalId: 'new', name: 'Denied' },
        update: {},
      }),
    ).rejects.toMatchObject({ code: 'WRITE_FORBIDDEN' });
    await expect(
      projects.createMany({ writePolicy: false, values: [{ name: 'Denied' }] }),
    ).rejects.toMatchObject({ code: 'WRITE_FORBIDDEN' });
    await expect(
      projects.updateMany({
        writePolicy: false,
        all: true,
        values: { name: 'Denied' },
      }),
    ).rejects.toMatchObject({ code: 'WRITE_FORBIDDEN' });
    expect(
      await projects.validateMutation({
        operation: 'createOne',
        writePolicy: false,
        values,
      }),
    ).toMatchObject({ valid: false, errors: [{ code: 'WRITE_FORBIDDEN' }] });
    expect(await projects.count()).toBe(0);
  });

  it('distinguishes false from an empty policy and permits generated/default fields', async () => {
    await context.builder.createCollection('policyDefaults', (c) => {
      c.increments('id');
      c.string('name').defaultTo('Default');
    });
    const repository = context.database.repository('policyDefaults');
    const created = await repository.createOne({ writePolicy: {}, values: {} });
    expect(created.record).toMatchObject({ name: 'Default' });
    await expect(
      repository.createOne({ writePolicy: {}, values: { name: 'Explicit' } }),
    ).rejects.toMatchObject({
      code: 'FIELD_WRITE_FORBIDDEN',
      path: ['values', 'name'],
    });
    expect(await repository.count()).toBe(1);
  });

  it('rejects an entire mutation when one scalar or nested field is forbidden, with matching preflight diagnostics', async () => {
    const fixture = await createMutationFixture(context);
    const projects = context.database.repository('repositoryProjects');
    const root = await projects.createOne({
      values: {
        name: 'Original',
        tasks: { connect: { id: fixture.implementTask } },
      },
    });
    const filter = { id: root.record.id as number };
    const options = {
      filter,
      writePolicy: {
        fields: ['name'],
        relations: { tasks: { update: { fields: ['title'] } } },
      },
      values: {
        name: 'Changed',
        tasks: {
          update: {
            filter: { id: fixture.implementTask as number },
            values: { title: 'Changed', points: { increment: 1 } },
          },
        },
      },
    };
    const diagnostic = {
      code: 'FIELD_WRITE_FORBIDDEN',
      path: ['values', 'tasks', 'update', 0, 'values', 'points'],
    };
    await expect(projects.updateOne(options)).rejects.toMatchObject(diagnostic);
    expect(
      await projects.validateMutation({ operation: 'updateOne', ...options }),
    ).toMatchObject({ valid: false, errors: [diagnostic] });
    expect(await projects.findOne({ filter })).toMatchObject({
      name: 'Original',
      version: 1,
    });
    expect(
      await context.database
        .repository('repositoryTasks')
        .findOne({ filter: { id: fixture.implementTask as number } }),
    ).toMatchObject({ title: 'Implement', points: 0 });
    await expect(
      projects.updateOne({
        filter,
        writePolicy: { fields: ['name'] },
        values: { name: 'Changed', ownerId: fixture.ada as number },
      }),
    ).rejects.toMatchObject({
      code: 'FIELD_WRITE_FORBIDDEN',
      path: ['values', 'ownerId'],
    });
  });

  it('uses independent create/update child policies, explicit nested permissions and managed relation keys', async () => {
    const fixture = await createMutationFixture(context);
    const projects = context.database.repository('repositoryProjects');
    const root = await projects.createOne({ values: { name: 'Root' } });
    const filter = { id: root.record.id as number };
    const configure = vi.fn((w: WritePolicyBuilder) =>
      w.relation('tasks', (r) =>
        r
          .create((t) =>
            t.fields('title').relation('assignee', (a) => a.connect()),
          )
          .update((t) => t.fields('points')),
      ),
    );
    await projects.updateOne({
      filter,
      writePolicy: configure,
      values: {
        tasks: (r) =>
          r.create({
            title: 'Created',
            assignee: (a) => a.connect({ id: fixture.ada }),
          }),
      },
    });
    expect(configure).toHaveBeenCalledTimes(1);
    const task = await context.database
      .repository('repositoryTasks')
      .findOne({ filter: { title: 'Created' } });
    expect(task).toMatchObject({
      projectId: root.record.id,
      assigneeId: fixture.ada,
    });
    await expect(
      projects.updateOne({
        filter,
        writePolicy: configure,
        values: { tasks: { create: { title: 'Denied', points: 1 } } },
      }),
    ).rejects.toMatchObject({ code: 'FIELD_WRITE_FORBIDDEN' });
    await expect(
      projects.updateOne({
        filter,
        writePolicy: configure,
        values: {
          tasks: {
            update: {
              filter: { id: task!.id as number },
              values: { assignee: { connect: { id: fixture.bob } } },
            },
          },
        },
      }),
    ).rejects.toMatchObject({
      code: 'RELATION_WRITE_FORBIDDEN',
      details: { relationPath: ['tasks', 'assignee'] },
    });
    await projects.updateOne({
      filter,
      writePolicy: configure,
      values: {
        tasks: {
          update: {
            filter: { id: task!.id as number },
            values: { points: { increment: 2 } },
          },
        },
      },
    });
    expect(
      await context.database
        .repository('repositoryTasks')
        .findOne({ filter: { id: task!.id as number } }),
    ).toMatchObject({ points: 2 });
  });

  it('denies every unlisted relation operation, including empty set and to-one writes', async () => {
    const fixture = await createMutationFixture(context);
    const projects = context.database.repository('repositoryProjects');
    const root = await projects.createOne({
      values: {
        name: 'Original',
        owner: { connect: { id: fixture.ada } },
        tasks: { connect: { id: fixture.implementTask } },
      },
    });
    const filter = { id: root.record.id as number };
    const selector = { id: fixture.implementTask as number };
    const operations = {
      create: { title: 'Denied' },
      connect: selector,
      disconnect: selector,
      set: [],
      update: { filter: selector, values: { title: 'Denied' } },
      upsert: {
        filter: { externalId: 'new' },
        create: { externalId: 'new', title: 'Denied' },
        update: { title: 'Denied' },
      },
      delete: { filter: selector },
    };
    for (const [operation, value] of Object.entries(operations)) {
      await expect(
        projects.updateOne({
          filter,
          writePolicy: { fields: ['name'] },
          values: { name: 'Denied', tasks: { [operation]: value } },
        }),
      ).rejects.toMatchObject({
        code: 'RELATION_WRITE_FORBIDDEN',
        details: { operation },
      });
    }
    for (const owner of [
      { disconnect: true },
      { update: { values: { name: 'Denied' } } },
      { delete: true },
    ]) {
      await expect(
        projects.updateOne({ filter, writePolicy: {}, values: { owner } }),
      ).rejects.toMatchObject({ code: 'RELATION_WRITE_FORBIDDEN' });
    }
    expect(await projects.findOne({ filter })).toMatchObject({
      name: 'Original',
      version: 1,
      ownerId: fixture.ada,
    });
    expect(
      await context.database
        .repository('repositoryTasks')
        .findOne({ filter: selector }),
    ).toMatchObject({ title: 'Implement', projectId: root.record.id });
  });

  it('checks unused upsert branches before inserting and evaluates nested policy callbacks once', async () => {
    await createMutationFixture(context);
    const projects = context.database.repository('repositoryProjects');
    await expect(
      projects.upsertOne({
        filter: { externalId: 'absent' },
        create: { externalId: 'absent', name: 'Allowed' },
        update: { name: 'Denied' },
        writePolicy: { create: { fields: ['externalId', 'name'] }, update: {} },
      }),
    ).rejects.toMatchObject({
      code: 'FIELD_WRITE_FORBIDDEN',
      path: ['update', 'name'],
    });
    expect(await projects.count()).toBe(0);
    const nested = vi.fn((w: RelationCreateWritePolicyBuilder) =>
      w.fields('title'),
    );
    await projects.createOne({
      writePolicy: (w) =>
        w.fields('name').relation('tasks', (r) => r.create(nested)),
      values: { name: 'Root', tasks: { create: { title: 'Task' } } },
    });
    expect(nested).toHaveBeenCalledTimes(1);
    await expect(
      projects.createMany({
        values: [{ name: 'Denied' }],
        writePolicy: {
          fields: ['name'],
          relations: {},
        } as FieldWritePolicyInput,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_WRITE_POLICY' });
  });

  it('checks through payload independently on create, connect and set', async () => {
    const fixture = await createMutationFixture(context);
    const projects = context.database.repository('repositoryProjects');
    const root = await projects.createOne({ values: { name: 'Root' } });
    const filter = { id: root.record.id as number };
    for (const operation of ['connect', 'set'] as const) {
      const target = {
        where: { id: fixture.databaseTag },
        through: { role: 'primary' },
      };
      const values = {
        tags: operation === 'set' ? { set: [target] } : { connect: target },
      };
      await expect(
        projects.updateOne({
          filter,
          values,
          writePolicy: { relations: { tags: { [operation]: {} } } },
        }),
      ).rejects.toMatchObject({ code: 'FIELD_WRITE_FORBIDDEN' });
      await projects.updateOne({
        filter,
        values,
        writePolicy: {
          relations: {
            tags: { [operation]: { through: { fields: ['role'] } } },
          },
        },
      });
    }
    const create = {
      values: { label: 'New tag' },
      through: { role: 'secondary' },
    };
    await expect(
      projects.updateOne({
        filter,
        values: { tags: { create } },
        writePolicy: { relations: { tags: { create: { fields: ['label'] } } } },
      }),
    ).rejects.toMatchObject({ code: 'FIELD_WRITE_FORBIDDEN' });
    await projects.updateOne({
      filter,
      values: { tags: { create } },
      writePolicy: (w) =>
        w.relation('tags', (r) =>
          r.create((t) => t.fields('label').through((t) => t.fields('role'))),
        ),
    });
    await expect(
      projects.updateOne({
        filter,
        values: {
          tags: {
            connect: {
              where: { id: fixture.databaseTag },
              through: { role: 'allowed', weight: 3 },
            },
          },
        },
        writePolicy: {
          relations: { tags: { connect: { through: { fields: ['role'] } } } },
        },
      }),
    ).rejects.toMatchObject({ code: 'FIELD_WRITE_FORBIDDEN', field: 'weight' });
    expect(
      await context.db(context.table('repositoryProjectTags')).orderBy('id'),
    ).toMatchObject([
      { role: 'primary', weight: 0 },
      { role: 'secondary', weight: 0 },
    ]);
  });

  it('keeps root and relationship upsert branches independent and validates both before writing', async () => {
    await createMutationFixture(context);
    const projects = context.database.repository('repositoryProjects');
    const writePolicy = buildUpsertWritePolicy((u) =>
      u
        .create((w) => w.fields('externalId', 'name'))
        .update((w) => w.fields('name')),
    );
    const options = {
      filter: { externalId: 'root' },
      create: { externalId: 'root', name: 'Created' },
      update: { name: 'Updated' },
      writePolicy,
    };
    await projects.upsertOne(options);
    await projects.upsertOne(options);
    await expect(
      projects.upsertOne({
        ...options,
        create: { ...options.create, metadata: {} },
      }),
    ).rejects.toMatchObject({
      code: 'FIELD_WRITE_FORBIDDEN',
      path: ['create', 'metadata'],
    });
    const filter = { externalId: 'root' };
    const values = {
      tasks: {
        upsert: {
          filter: { externalId: 'task' },
          create: { externalId: 'task', title: 'Created' },
          update: { title: 'Updated' },
        },
      },
    };
    await expect(
      projects.updateOne({
        filter,
        values,
        writePolicy: {
          relations: {
            tasks: {
              create: { fields: ['externalId', 'title'] },
              update: { fields: ['title'] },
            },
          },
        },
      }),
    ).rejects.toMatchObject({
      code: 'RELATION_WRITE_FORBIDDEN',
      details: { operation: 'upsert' },
    });
    const nested = buildWritePolicy((w) =>
      w.relation('tasks', (r) =>
        r.upsert((u) =>
          u
            .create((w) => w.fields('externalId', 'title'))
            .update((w) => w.fields('title')),
        ),
      ),
    );
    await projects.updateOne({ filter, values, writePolicy: nested });
    await projects.updateOne({ filter, values, writePolicy: nested });
    await expect(
      projects.updateOne({
        filter,
        values: {
          tasks: {
            upsert: {
              ...values.tasks.upsert,
              update: { title: 'Denied', points: 1 },
            },
          },
        },
        writePolicy: nested,
      }),
    ).rejects.toMatchObject({ code: 'FIELD_WRITE_FORBIDDEN' });
    expect(
      await context.database
        .repository('repositoryTasks')
        .findOne({ filter: { externalId: 'task' } }),
    ).toMatchObject({ title: 'Updated', points: 0 });
  });

  it('validates all policy names and managed fields even if not used by the request', async () => {
    await createMutationFixture(context);
    const projects = context.database.repository('repositoryProjects');
    const policies: WritePolicyInput[] = [
      { fields: ['missing'] },
      { fields: ['version'] },
      { fields: ['tasks'] },
      { relations: { missing: { update: {} } } },
      { relations: { tasks: { update: { fields: ['missing'] } } } },
      { relations: { tasks: { create: { through: { fields: ['role'] } } } } },
      {
        relations: {
          tags: { connect: { through: { fields: ['projectId'] } } },
        },
      },
    ];
    for (const writePolicy of policies)
      await expect(
        projects.updateOne({
          writePolicy,
          filter: { id: 1 },
          values: { name: 'Ignored' },
        }),
      ).rejects.toMatchObject({ code: 'INVALID_WRITE_POLICY' });
  });

  it('checks every bulk row before writes and restricts bulk policies to scalar fields', async () => {
    await createMutationFixture(context);
    const projects = context.database.repository('repositoryProjects');
    await expect(
      projects.createMany({
        writePolicy: { fields: ['name'] },
        values: [{ name: 'First' }, { name: 'Denied', metadata: {} }],
      }),
    ).rejects.toMatchObject({
      code: 'FIELD_WRITE_FORBIDDEN',
      path: ['values', 1, 'metadata'],
    });
    expect(await projects.count()).toBe(0);
    await projects.createMany({
      writePolicy: (w) => w.fields('name'),
      values: [{ name: 'First' }, { name: 'Second' }],
    });
    await projects.updateMany({
      all: true,
      writePolicy: { fields: ['name'] },
      values: { name: 'Updated' },
    });
    await expect(
      projects.updateMany({
        all: true,
        writePolicy: {},
        values: { name: 'Denied' },
      }),
    ).rejects.toMatchObject({ code: 'FIELD_WRITE_FORBIDDEN' });
    expect(await projects.count({ filter: { name: 'Updated' } })).toBe(2);
  });
});
