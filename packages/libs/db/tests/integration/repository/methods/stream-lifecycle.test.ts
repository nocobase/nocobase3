import { expect, it, vi } from 'vitest';
import { describeIntegrationDatabases } from '../../helpers.js';
import {
  createDocumentationFixture,
  seedDocumentationProjects,
} from '../fixtures/documentation.js';

describeIntegrationDatabases('Repository stream lifecycle', (context) => {
  it('returns from iterator cleanup only after Knex releases the stream connection', async () => {
    await createDocumentationFixture(context);
    await seedDocumentationProjects(context, 'stream');
    const iterator = context.database
      .repository('projects')
      .findMany()
      [Symbol.asyncIterator]();
    expect((await iterator.next()).done).toBe(false);
    const release = vi.spyOn(context.db.client, 'releaseConnection');
    try {
      await iterator.return!();
      expect(release).toHaveBeenCalled();
      release.mockClear();
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(release).not.toHaveBeenCalled();
    } finally {
      release.mockRestore();
    }
  });

  it('propagates a database read failure and releases its connection', async () => {
    await createDocumentationFixture(context);
    await seedDocumentationProjects(context, 'stream');
    const tasks = context.database.repository('tasks');
    await tasks.findMany();
    // Leave Collection metadata intact to exercise a physical database failure.
    await context.db.schema.dropTable(context.table('tasks'));
    const iterator = tasks.findMany()[Symbol.asyncIterator]();
    await expect(iterator.next()).rejects.toThrow();
    expect(await context.database.repository('projects').count()).toBe(3);
  });

  it('propagates consumer failure and leaves the connection usable', async () => {
    await createDocumentationFixture(context);
    await seedDocumentationProjects(context, 'stream');
    const projects = context.database.repository('projects');
    const error = new Error('Consumer failed');
    const consume = async () => {
      for await (const row of projects.findMany({
        select: (s) => s.fields('id'),
        sort: (s) => s.field('id').asc(),
      })) {
        expect(row).toEqual({ id: 'stream-a' });
        throw error;
      }
    };
    await expect(consume()).rejects.toBe(error);
    expect(await projects.count()).toBe(3);
  });

  it('supports explicit iterator return and repeated iteration with independent context', async () => {
    await createDocumentationFixture(context);
    await seedDocumentationProjects(context, 'stream');
    const projects = context.database.repository('projects');
    for (const id of ['stream-a', 'stream-b']) {
      const iterator = projects
        .findMany({
          filter: (f) => f.string('id').eq(f.variable('$id')),
          context: { id },
          select: (s) => s.fields('id'),
        })
        [Symbol.asyncIterator]();
      expect(await iterator.next()).toMatchObject({
        value: { id },
        done: false,
      });
      expect(iterator.return).toBeTypeOf('function');
      await iterator.return!();
      expect(await iterator.next()).toMatchObject({ done: true });
    }
    expect(await projects.count()).toBe(3);
  });

  it('supports backward iteration and rejects missing context without changing data', async () => {
    await createDocumentationFixture(context);
    await seedDocumentationProjects(context, 'stream');
    const projects = context.database.repository('projects');
    const backward = projects
      .findMany({
        sort: (s) => s.field('id').asc(),
        cursor: { id: 'stream-b' },
        direction: 'backward',
      })
      [Symbol.asyncIterator]();
    expect(await backward.next()).toMatchObject({
      done: false,
      value: { id: 'stream-a' },
    });
    expect(await backward.next()).toMatchObject({ done: true });
    const missing = projects
      .findMany({ filter: (f) => f.string('id').eq(f.variable('$id')) })
      [Symbol.asyncIterator]();
    await expect(missing.next()).rejects.toMatchObject({
      code: 'VARIABLE_NOT_FOUND',
    });
    expect(await projects.count()).toBe(3);
  });
});
