import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../../../helpers.js';
import { createMutationFixture } from '../../fixtures/mutations.js';

describeIntegrationDatabases(
  'Repository relation update and upsert matrix',
  (context) => {
    const cases = [
      {
        relation: 'owner',
        table: 'repositoryUsers',
        key: 'ada',
        field: 'name',
        create: { name: 'Created', email: 'matrix@example.com' },
        unique: { email: 'matrix@example.com' },
      },
      {
        relation: 'profile',
        table: 'repositoryProjectProfiles',
        key: 'profile',
        field: 'summary',
        create: { summary: 'Created' },
        unique: undefined,
      },
      {
        relation: 'tasks',
        table: 'repositoryTasks',
        key: 'implementTask',
        field: 'title',
        create: { title: 'Created', externalId: 'matrix-task' },
        unique: { externalId: 'matrix-task' },
      },
      {
        relation: 'tags',
        table: 'repositoryTagsForMutation',
        key: 'databaseTag',
        field: 'label',
        create: { label: 'matrix-tag' },
        unique: { label: 'matrix-tag' },
      },
    ] as const;

    it.each(cases)(
      '$relation updates only the selected linked target',
      async (c) => {
        const fixture = await createMutationFixture(context);
        const projects = context.database.repository('repositoryProjects');
        const id = fixture[c.key] as number;
        const created = await projects.createOne({
          values: { name: 'Root', [c.relation]: { connect: { id } } },
        });
        const before = await context
          .db(context.table(c.table))
          .whereNot({ id })
          .orderBy('id');
        await projects.updateOne({
          filter: { id: created.record.id as number },
          values: {
            [c.relation]: {
              update: { filter: { id }, values: { [c.field]: 'Updated' } },
            },
          },
        });
        expect(
          await context
            .db(context.table(c.table))
            .where({ id })
            .select(c.field),
        ).toEqual([{ [c.field]: 'Updated' }]);
        expect(
          await context
            .db(context.table(c.table))
            .whereNot({ id })
            .orderBy('id'),
        ).toEqual(before);
      },
    );

    it.each(cases)(
      '$relation upsert creates once and updates the same target on repetition',
      async (c) => {
        await createMutationFixture(context);
        const projects = context.database.repository('repositoryProjects');
        const created = await projects.createOne({ values: { name: 'Root' } });
        const before = await context.db(context.table(c.table)).orderBy('id');
        const filter = { id: created.record.id as number };
        const run = () =>
          projects.updateOne({
            filter,
            values: {
              [c.relation]: {
                upsert: {
                  filter: c.unique,
                  create: c.create,
                  update: {
                    [c.field]: c.relation === 'tags' ? 'matrix-tag' : 'Updated',
                  },
                },
              },
            },
            select: (s) =>
              s
                .fields('name')
                .include(c.relation, (r) => r.fields('id', c.field)),
          });
        const first = await run();
        const second = await run();
        const many = c.relation === 'tasks' || c.relation === 'tags';
        const firstTarget = (
          many
            ? (first.record[c.relation] as unknown[])[0]
            : first.record[c.relation]
        ) as Record<string, unknown>;
        const secondTarget = (
          many
            ? (second.record[c.relation] as unknown[])[0]
            : second.record[c.relation]
        ) as Record<string, unknown>;
        expect(secondTarget.id).toBe(firstTarget.id);
        expect(secondTarget[c.field]).toBe(
          c.relation === 'tags' ? 'matrix-tag' : 'Updated',
        );
        const after = await context.db(context.table(c.table)).orderBy('id');
        expect(after).toHaveLength(before.length + 1);
        expect(after.filter((row) => row.id !== firstTarget.id)).toEqual(
          before,
        );
        if (many) expect(second.record[c.relation]).toHaveLength(1);
      },
    );
  },
);
