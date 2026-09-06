import { expect, it } from 'vitest';
import type { ValuesBuilder } from '../../../../src/index.js';
import {
  describeIntegrationDatabases,
  type IntegrationTestContext,
} from '../../helpers.js';

async function fixture(context: IntegrationTestContext): Promise<void> {
  await context.builder.createCollections([
    {
      name: 'varAccounts',
      definition: (c) => {
        c.string('accountCode').primary().notNull();
      },
    },
    {
      name: 'varLabels',
      definition: (c) => {
        c.string('labelCode').primary().notNull();
      },
    },
    {
      name: 'varEdges',
      definition: (c) => {
        c.string('projectCode').notNull();
        c.string('labelCode').notNull();
        c.string('role').notNull();
        c.json('metadata').nullable();
      },
    },
    {
      name: 'varProjects',
      definition: (c) => {
        c.string('projectCode').primary().notNull();
        c.string('title').notNull();
        c.string('ownerCode').nullable();
        c.belongsTo('owner', 'varAccounts')
          .foreignKey('ownerCode')
          .targetKey('accountCode');
        c.hasMany('tasks', 'varTasks')
          .sourceKey('projectCode')
          .foreignKey('projectCode');
        c.belongsToMany('labels', 'varLabels')
          .sourceKey('projectCode')
          .targetKey('labelCode')
          .through('varEdges')
          .foreignKey('projectCode')
          .otherKey('labelCode');
      },
    },
    {
      name: 'varTasks',
      definition: (c) => {
        c.string('taskCode').primary().notNull();
        c.string('title').notNull();
        c.integer('points').notNull().defaultTo(0);
        c.string('projectCode').nullable();
        c.string('ownerCode').nullable();
        c.belongsTo('owner', 'varAccounts')
          .foreignKey('ownerCode')
          .targetKey('accountCode');
      },
    },
  ]);
  await context.database
    .repository('varAccounts')
    .createMany({ values: [{ accountCode: 'A' }, { accountCode: 'B' }] });
  await context.database
    .repository('varLabels')
    .createMany({ values: [{ labelCode: 'L1' }, { labelCode: 'L2' }] });
}

describeIntegrationDatabases('Repository relation variables', (context) => {
  it('resolves nested create, connect and through payload in Builder and JSON inputs', async () => {
    await fixture(context);
    const projects = context.database.repository('varProjects');
    const inputContext = {
      project: 'P',
      task: 'T',
      title: 'Nested',
      owner: 'A',
      label: 'L1',
      role: 'editor',
    };
    const values = (v: ValuesBuilder) => ({
      projectCode: v.variable('$project'),
      title: 'Root',
      owner: { connect: { accountCode: v.variable('$owner') } },
      tasks: {
        create: {
          taskCode: v.variable('$task'),
          title: v.variable('$title'),
          owner: { connect: { accountCode: v.variable('$owner') } },
        },
      },
      labels: {
        connect: {
          where: { labelCode: v.variable('$label') },
          through: {
            role: v.variable('$role'),
            metadata: v.literal({ kind: 'variable', path: '$raw' }),
          },
        },
      },
    });
    await expect(
      projects.validateMutation({
        operation: 'createOne',
        values,
        context: inputContext,
      }),
    ).resolves.toEqual({ valid: true, errors: [] });
    expect(await projects.count()).toBe(0);
    const created = await projects.createOne({
      values,
      context: inputContext,
      select: (s) =>
        s
          .fields('projectCode')
          .include('tasks', (t) =>
            t
              .fields('taskCode', 'title')
              .include('owner', (o) => o.fields('accountCode')),
          ),
    });
    expect(created.record).toEqual({
      projectCode: 'P',
      tasks: [{ taskCode: 'T', title: 'Nested', owner: { accountCode: 'A' } }],
    });
    const edge = await context.database
      .repository('varEdges')
      .findOne({ filter: { projectCode: 'P' } });
    expect(edge).toMatchObject({ role: 'editor' });
    expect(
      typeof edge?.metadata === 'string'
        ? JSON.parse(edge.metadata)
        : edge?.metadata,
    ).toEqual({ kind: 'variable', path: '$raw' });
    await projects.updateOne({
      filter: { projectCode: 'P' },
      values: (v) => ({
        labels: (labels) =>
          labels.set([
            {
              where: { labelCode: v.variable('$label') },
              through: { role: v.variable('$role') },
            },
          ]),
      }),
      context: { label: 'L2', role: 'reader' },
    });
    expect(
      await context.database
        .repository('varEdges')
        .findMany({ select: (s) => s.fields('labelCode', 'role') }),
    ).toEqual([{ labelCode: 'L2', role: 'reader' }]);
    await projects.updateOne({
      filter: { projectCode: 'P' },
      values: (v) => ({
        labels: (labels) =>
          labels.disconnect({ labelCode: v.variable('$label') }),
      }),
      context: { label: 'L2' },
    });
    expect(await context.database.repository('varEdges').count()).toBe(0);
    await projects.updateOne({
      filter: { projectCode: 'P' },
      values: (v) => ({
        labels: (labels) =>
          labels.create(
            { labelCode: v.variable('$label') },
            { through: { role: v.variable('$role') } },
          ),
      }),
      context: { label: 'L3', role: 'creator' },
    });
    expect(
      await context.database
        .repository('varLabels')
        .exists({ filter: { labelCode: 'L3' } }),
    ).toBe(true);
    expect(
      await context.database
        .repository('varEdges')
        .findMany({ select: (s) => s.fields('labelCode', 'role') }),
    ).toEqual([{ labelCode: 'L3', role: 'creator' }]);
  });

  it('shares context with nested update, upsert and delete filters without escaping the parent scope', async () => {
    await fixture(context);
    const projects = context.database.repository('varProjects');
    const tasks = context.database.repository('varTasks');
    await projects.createOne({
      values: {
        projectCode: 'P',
        title: 'Root',
        tasks: { create: { taskCode: 'T', title: 'Before' } },
      },
    });
    await projects.createOne({
      values: {
        projectCode: 'OTHER',
        title: 'Other',
        tasks: { create: { taskCode: 'OUTSIDE', title: 'Untouched' } },
      },
    });
    await projects.updateOne({
      filter: { projectCode: 'P' },
      values: (v) => ({
        tasks: (t) =>
          t.update({
            filter: (f) => f.string('taskCode').eq(f.variable('$task')),
            values: {
              title: v.variable('$title'),
              points: (p) => p.increment(v.variable('$delta')),
            },
          }),
      }),
      context: { task: 'T', title: 'Updated', delta: 2 },
    });
    expect(await tasks.findOne({ filter: { taskCode: 'T' } })).toMatchObject({
      title: 'Updated',
      points: 2,
    });
    for (const title of ['Created', 'Upserted']) {
      await projects.updateOne({
        filter: { projectCode: 'P' },
        values: (v) => ({
          tasks: (t) =>
            t.upsert({
              filter: (f) => f.string('taskCode').eq(f.variable('$task')),
              create: {
                taskCode: v.variable('$task'),
                title: v.variable('$title'),
              },
              update: { title: v.variable('$title') },
            }),
        }),
        context: { task: 'NEW', title },
      });
    }
    expect(await tasks.findOne({ filter: { taskCode: 'NEW' } })).toMatchObject({
      title: 'Upserted',
    });
    await expect(
      projects.updateOne({
        filter: { projectCode: 'P' },
        values: (v) => ({
          title: 'Must roll back',
          tasks: (t) =>
            t.update({
              filter: (f) => f.string('taskCode').eq(f.variable('$task')),
              values: { title: v.variable('$title') },
            }),
        }),
        context: { task: 'OUTSIDE', title: 'Forbidden' },
      }),
    ).rejects.toMatchObject({ code: 'RELATION_TARGET_NOT_FOUND' });
    expect(
      await projects.findOne({ filter: { projectCode: 'P' } }),
    ).toMatchObject({ title: 'Root' });
    expect(
      await tasks.findOne({ filter: { taskCode: 'OUTSIDE' } }),
    ).toMatchObject({ title: 'Untouched' });
    await projects.updateOne({
      filter: { projectCode: 'P' },
      values: {
        tasks: {
          delete: {
            filter: (f) => f.string('taskCode').eq(f.variable('$task')),
          },
        },
      },
      context: { task: 'NEW' },
    });
    expect(await tasks.exists({ filter: { taskCode: 'NEW' } })).toBe(false);
  });

  it('rejects nested missing variables, selector conflicts and invalid payloads without residual writes', async () => {
    await fixture(context);
    const projects = context.database.repository('varProjects');
    await expect(
      projects.createOne({
        values: (v) => ({
          projectCode: 'P',
          title: 'Root',
          tasks: (t) =>
            t.create({ taskCode: 'T', title: v.variable('$missing') }),
        }),
      }),
    ).rejects.toMatchObject({
      code: 'VARIABLE_NOT_FOUND',
      details: { variable: '$missing' },
    });
    expect(await projects.count()).toBe(0);
    expect(await context.database.repository('varTasks').count()).toBe(0);
    await expect(
      projects.createOne({
        values: (v) => ({
          projectCode: 'P',
          title: 'Root',
          labels: (l) =>
            l.connect(
              { labelCode: 'L1' },
              { through: { role: v.variable('$role') } },
            ),
        }),
        context: { role: null },
      }),
    ).rejects.toMatchObject({
      code: 'INVALID_MUTATION',
      details: { variable: '$role' },
    });
    await expect(
      projects.createOne({
        values: (v) => ({
          projectCode: 'P',
          title: 'Root',
          labels: (l) =>
            l
              .connect(
                { labelCode: v.variable('$one') },
                { through: { role: 'a' } },
              )
              .connect(
                { labelCode: v.variable('$two') },
                { through: { role: 'b' } },
              ),
        }),
        context: { one: 'L1', two: 'L1' },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_MUTATION' });
    expect(await projects.count()).toBe(0);
    expect(await context.database.repository('varEdges').count()).toBe(0);
  });

  it('executes serialized relation variables and rolls back a resolved but missing connect target', async () => {
    await fixture(context);
    const projects = context.database.repository('varProjects');
    const request = JSON.parse(
      JSON.stringify({
        values: {
          projectCode: 'JSON',
          title: { kind: 'variable', path: '$title' },
          tasks: {
            create: {
              taskCode: 'JSON-T',
              title: { kind: 'variable', path: '$title' },
            },
          },
          owner: {
            connect: { accountCode: { kind: 'variable', path: '$owner' } },
          },
        },
        context: { title: 'JSON data', owner: 'A' },
      }),
    ) as Parameters<typeof projects.createOne>[0];
    await projects.createOne(request);
    expect(
      await context.database
        .repository('varTasks')
        .findOne({ filter: { taskCode: 'JSON-T' } }),
    ).toMatchObject({ title: 'JSON data', projectCode: 'JSON' });
    await expect(
      projects.updateOne({
        filter: { projectCode: 'JSON' },
        values: (v) => ({
          title: 'Must roll back',
          tasks: (t) =>
            t
              .create({ taskCode: 'ROLLBACK', title: v.variable('$title') })
              .connect({ taskCode: v.variable('$missingTarget') }),
        }),
        context: {
          title: 'Created then rolled back',
          missingTarget: 'NOT-FOUND',
        },
      }),
    ).rejects.toMatchObject({ code: 'RECORD_NOT_FOUND' });
    expect(
      await projects.findOne({ filter: { projectCode: 'JSON' } }),
    ).toMatchObject({ title: 'JSON data' });
    expect(await context.database.repository('varTasks').count()).toBe(1);
  });
});
