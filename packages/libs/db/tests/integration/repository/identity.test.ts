import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../helpers.js';

describeIntegrationDatabases('Repository explicit identity', (context) => {
  it('replaces hasMany targets by complete composite identities', async () => {
    await context.database.transaction(async (connection) => {
      await connection.builder.createCollection('teams', (c) => {
        c.string('code').primary().notNull();
        c.hasMany('members', 'teamMembers')
          .sourceKey('code')
          .foreignKey('team');
      });
      await connection.builder.createCollection('teamMembers', (c) => {
        c.string('account').notNull();
        c.string('region').notNull();
        c.string('team').nullable();
        c.primary(['account', 'region']);
      });
    });
    const teams = context.database.repository('teams');
    const members = context.database.repository('teamMembers');
    await members.createMany({
      values: [
        { account: 'same', region: 'east' },
        { account: 'same', region: 'west' },
      ],
    });
    await teams.createOne({
      values: {
        code: 'T',
        members: {
          connect: [
            { account: 'same', region: 'east' },
            { account: 'same', region: 'west' },
          ],
        },
      },
    });
    await teams.updateOne({
      filter: { code: 'T' },
      values: { members: { set: [{ account: 'same', region: 'west' }] } },
    });
    expect(
      await members.findMany({ sort: (s) => s.field('region').asc() }),
    ).toEqual([
      { account: 'same', region: 'east', team: null },
      { account: 'same', region: 'west', team: 'T' },
    ]);
    await teams.updateOne({
      filter: { code: 'T' },
      values: { members: { disconnect: { account: 'same', region: 'west' } } },
    });
    expect(await members.count({ filter: { team: 'T' } })).toBe(0);
  });
  it('reads and mutates explicit string relations without id fields or hasMany targetKey', async () => {
    await context.database.transaction(async (connection) => {
      await connection.builder.createCollection(
        'businessProjects',
        (collection) => {
          collection.string('code').primary().notNull();
          collection.string('account').unique().notNull();
          collection
            .hasMany('tasks', 'businessTasks')
            .sourceKey('account')
            .foreignKey('projectAccount');
          collection
            .hasOne('featured', 'businessTasks')
            .sourceKey('account')
            .foreignKey('featuredAccount');
          collection
            .belongsToMany('tags', 'businessTags')
            .sourceKey('account')
            .targetKey('label')
            .through('businessEdges')
            .foreignKey('projectAccount')
            .otherKey('tagLabel');
        },
      );
      await connection.builder.createCollection(
        'businessTasks',
        (collection) => {
          collection.string('taskNo').primary().notNull();
          collection.string('projectAccount').nullable();
          collection.string('featuredAccount').nullable();
          collection
            .belongsTo('project', 'businessProjects')
            .foreignKey('projectAccount')
            .targetKey('account');
        },
      );
      await connection.builder.createCollection(
        'businessTags',
        (collection) => {
          collection.string('code').primary().notNull();
          collection.string('label').unique().notNull();
        },
      );
      await connection.builder.createCollection(
        'businessEdges',
        (collection) => {
          collection.string('projectAccount').notNull();
          collection.string('tagLabel').notNull();
          collection.string('role').nullable();
          collection.unique(['projectAccount', 'tagLabel']);
        },
      );
    });
    const projects = context.database.repository('businessProjects');
    const tasks = context.database.repository('businessTasks');
    await tasks.createMany({ values: [{ taskNo: 'T1' }, { taskNo: 'T2' }] });
    await projects.createOne({
      values: {
        code: 'P1',
        account: 'business-A',
        tasks: { connect: { taskNo: 'T1' } },
        tags: {
          create: {
            values: { code: 'tag-A', label: 'database' },
            through: { role: 'owner' },
          },
        },
      },
    });
    await projects.updateOne({
      filter: { code: 'P1' },
      values: {
        tasks: { connect: { taskNo: 'T2' } },
        featured: { connect: { taskNo: 'T1' } },
      },
    });
    await projects.updateOne({
      filter: { code: 'P1' },
      values: {
        tasks: { set: [{ taskNo: 'T2' }] },
        featured: { connect: { taskNo: 'T2' } },
      },
    });
    expect(await tasks.findOne({ filter: { taskNo: 'T1' } })).toMatchObject({
      projectAccount: null,
      featuredAccount: null,
    });
    expect(
      await tasks.findOne({
        filter: { taskNo: 'T2' },
        select: (s) =>
          s.fields('taskNo').include('project', (p) => p.fields('code')),
      }),
    ).toEqual({ taskNo: 'T2', project: { code: 'P1' } });
    const selected = await projects.findOne({
      filter: { code: 'P1' },
      select: (s) =>
        s
          .fields('code')
          .include('tasks', (t) => t.count())
          .include('tags', (t) => t.fields('label')),
    });
    expect(selected).toEqual({
      code: 'P1',
      tasks: 1,
      tags: [{ label: 'database' }],
    });
    await projects.updateOne({
      filter: { code: 'P1' },
      values: { tasks: { disconnect: { taskNo: 'T2' } }, tags: { set: [] } },
    });
    expect(await tasks.findOne({ filter: { taskNo: 'T2' } })).toMatchObject({
      projectAccount: null,
    });
    expect(await context.database.repository('businessEdges').count()).toBe(0);
  });

  it('writes using a string unique key without a primary key or an id field', async () => {
    await context.builder.createCollection('accounts', (collection) => {
      collection.string('account').notNull().unique();
      collection.string('name').notNull();
    });
    const accounts = context.database.repository('accounts');
    expect(
      (await accounts.createOne({ values: { account: 'A', name: 'First' } }))
        .record,
    ).toEqual({ account: 'A', name: 'First' });
    expect(
      (
        await accounts.updateOne({
          filter: { account: 'A' },
          values: { name: 'Changed' },
        })
      ).record.name,
    ).toBe('Changed');
    expect(
      await accounts.findMany({
        sort: (sort) => sort.field('account').asc(),
        cursor: { account: '0' },
      }),
    ).toHaveLength(1);
    expect(await accounts.deleteOne({ filter: { account: 'A' } })).toEqual({
      deleted: true,
    });
  });

  it('preserves string id values through create, update and delete', async () => {
    await context.builder.createCollection('stringIds', (collection) => {
      collection.string('id').primary().notNull();
      collection.string('name').notNull();
    });
    const records = context.database.repository('stringIds');
    expect(
      (await records.createOne({ values: { id: 'external-A', name: 'A' } }))
        .record.id,
    ).toBe('external-A');
    expect(
      (
        await records.updateOne({
          filter: { id: 'external-A' },
          values: { name: 'B' },
        })
      ).record.id,
    ).toBe('external-A');
    await records.deleteOne({ filter: { id: 'external-A' } });
    expect(await records.count()).toBe(0);
  });

  it('supports collection operations on records without any unique key', async () => {
    await context.builder.createCollection('events', (collection) => {
      collection.string('id');
      collection.string('message');
    });
    const events = context.database.repository('events');
    expect(
      await events.createMany({
        values: [
          { id: 'duplicate', message: 'A' },
          { id: 'duplicate', message: 'A' },
        ],
      }),
    ).toEqual({ createdCount: 2 });
    expect(await events.count()).toBe(2);
    expect(
      await events.updateMany({
        filter: { id: 'duplicate' },
        values: { message: 'B' },
      }),
    ).toEqual({ updatedCount: 2 });
    expect(await events.deleteMany({ filter: { message: 'B' } })).toEqual({
      deletedCount: 2,
    });
  });
});
