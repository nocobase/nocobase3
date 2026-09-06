import { expect, it, vi } from 'vitest';
import type {
  FindManyOptions,
  RepositoryQuery,
  RepositoryRecord,
} from '../../../../src/index.js';
import { describeIntegrationDatabases } from '../../helpers.js';
import {
  createDocumentationFixture,
  seedDocumentationProjects,
} from '../fixtures/documentation.js';

async function collect<T>(rows: AsyncIterable<T>): Promise<T[]> {
  const result: T[] = [];
  for await (const row of rows) result.push(row);
  return result;
}

describeIntegrationDatabases('Repository findMany consumption', (context) => {
  it('defers SQL and snapshots context at consumption instead of capturing construction-time values', async () => {
    await createDocumentationFixture(context);
    await seedDocumentationProjects(context, 'q');
    const projects = context.database.repository('projects');
    const input = { id: 'q-a' };
    const filter = vi.fn(
      (f: import('../../../../src/index.js').FilterBuilder) =>
        f.string('id').eq(f.variable('$id')),
    );
    const query = projects.findMany({ filter, context: input });
    expect(filter).not.toHaveBeenCalled();
    input.id = 'q-b';
    const execution = query.then((rows) => rows);
    input.id = 'q-c';
    expect((await execution).map((r) => r.id)).toEqual(['q-b']);
    expect(await query).toEqual(await execution);
    expect(filter).toHaveBeenCalledTimes(1);
    expect(() => query[Symbol.asyncIterator]()).toThrow(
      expect.objectContaining({ code: 'QUERY_ALREADY_CONSUMED' }),
    );
    const streamed = projects.findMany({ filter, context: input });
    const iterator = streamed[Symbol.asyncIterator]();
    input.id = 'q-a';
    expect((await iterator.next()).value).toMatchObject({ id: 'q-c' });
    await iterator.return!();
    await expect(streamed).rejects.toMatchObject({
      code: 'QUERY_ALREADY_CONSUMED',
    });
  });

  it('matches arrays for offset, distinct, both cursor directions and empty projections', async () => {
    await createDocumentationFixture(context);
    const tasks = context.database.repository('tasks');
    await tasks.createMany({
      values: [
        { id: 'A', title: 'A', points: 2, status: 'open' },
        { id: 'B', title: 'B', points: 2, status: 'open' },
        { id: 'C', title: 'C', points: 1, status: 'done' },
        { id: 'D', title: 'D', points: 1, status: 'archived' },
      ],
    });
    const cases: FindManyOptions<RepositoryRecord>[] = [
      {},
      { offset: 1, limit: 2 },
      { limit: 0 },
      { offset: 99 },
      { select: (s) => s.fields() },
      { distinct: ['status'] },
      {
        distinct: ['status'],
        cursor: { id: 'D' },
        direction: 'backward',
        limit: 1,
      },
      { cursor: { id: 'C' }, direction: 'backward' },
      { cursor: { id: 'A' }, direction: 'forward', limit: 2 },
    ];
    for (const options of cases) {
      const input: FindManyOptions<RepositoryRecord> = {
        sort: (s) => s.field('id').asc(),
        ...options,
      };
      expect(await collect(tasks.findMany(input))).toEqual(
        await tasks.findMany(input),
      );
    }
  });

  it('keeps relation reads inside a transaction and rejects unconsumed queries after commit', async () => {
    await createDocumentationFixture(context);
    let delayed: RepositoryQuery<RepositoryRecord> | undefined;
    await context.database.transaction(async (connection) => {
      const projects = connection.repository('projects');
      await projects.createOne({
        values: {
          id: 'A',
          name: 'Uncommitted',
          tasks: { create: [{ id: 'T', title: 'Inside' }] },
        },
      });
      const options = {
        select: (s: import('../../../../src/index.js').SelectBuilder) =>
          s.fields('name').include('tasks', (t) => t.fields('title')),
      };
      expect(await collect(projects.findMany(options))).toEqual([
        { name: 'Uncommitted', tasks: [{ title: 'Inside' }] },
      ]);
      delayed = projects.findMany(options);
    }, context.spec.name);
    await expect(delayed!).rejects.toMatchObject({
      code: 'QUERY_TRANSACTION_COMPLETED',
    });
    let delayedStream: RepositoryQuery<RepositoryRecord> | undefined;
    await context.database.transaction(async (connection) => {
      delayedStream = connection.repository('projects').findMany();
    }, context.spec.name);
    await expect(collect(delayedStream!)).rejects.toMatchObject({
      code: 'QUERY_TRANSACTION_COMPLETED',
    });
  });
});
