import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../../helpers.js';
import { createDocumentationFixture } from '../fixtures/documentation.js';

describeIntegrationDatabases('Repository pagination boundaries', (context) => {
  for (const parameter of ['limit', 'offset'] as const) {
    it.each([
      -1,
      0.5,
      NaN,
      Infinity,
      -Infinity,
      Number.MAX_SAFE_INTEGER + 1,
      '2',
      null,
    ])(`rejects ${parameter}=%s`, async (value) => {
      await createDocumentationFixture(context);
      await expect(
        context.database.repository('tasks').findMany({
          sort: (s) => s.field('id').asc(),
          [parameter]: value as never,
        }),
      ).rejects.toMatchObject({
        code: 'INVALID_PAGINATION',
        path: [parameter],
      });
    });
  }

  it.each([
    null,
    [],
    {},
    { id: null },
    { id: undefined },
    { id: 1 },
    { id: 'A', extra: 1 },
  ])('rejects malformed string-key cursor %j', async (cursor) => {
    await createDocumentationFixture(context);
    await expect(
      context.database.repository('tasks').findMany({
        sort: (s) => s.field('id').asc(),
        cursor: cursor as never,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_PAGINATION' });
  });

  it('handles zero, beyond-end offsets and nonexistent cursor anchors in both directions', async () => {
    await createDocumentationFixture(context);
    const tasks = context.database.repository('tasks');
    await tasks.createMany({
      values: [
        { id: 'A', title: 'A', points: 2 },
        { id: 'B', title: 'B', points: 2 },
        { id: 'C', title: 'C', points: 1 },
        { id: 'D', title: 'D', points: 1 },
      ],
    });
    const options = {
      sort: {
        kind: 'sort',
        version: 1,
        items: [
          { kind: 'field', path: ['points'], direction: 'desc' },
          { kind: 'field', path: ['id'], direction: 'asc' },
        ],
      },
    } as const;
    expect(await tasks.findMany({ ...options, limit: 0 })).toEqual([]);
    expect(await tasks.findMany({ ...options, offset: 99 })).toEqual([]);
    expect(
      await tasks.findMany({
        ...options,
        offset: 0,
        limit: 1,
        select: (s) => s.fields('id'),
      }),
    ).toEqual([{ id: 'A' }]);
    const cursor = Object.freeze({ points: 2, id: 'BB' });
    for (const direction of ['forward', 'backward'] as const) {
      expect(
        await tasks.findMany({
          ...options,
          cursor,
          direction,
          limit: 1,
          select: (s) => s.fields('id'),
        }),
      ).toEqual([{ id: direction === 'forward' ? 'C' : 'B' }]);
      expect(
        await tasks.findMany({ ...options, cursor, direction, limit: 0 }),
      ).toEqual([]);
    }
    expect(cursor).toEqual({ points: 2, id: 'BB' });
  });

  it('rejects invalid direction and offset/cursor conflicts even at zero', async () => {
    await createDocumentationFixture(context);
    const tasks = context.database.repository('tasks');
    await expect(
      tasks.findMany({
        sort: (s) => s.field('id').asc(),
        cursor: { id: 'A' },
        direction: 'sideways' as never,
      }),
    ).rejects.toMatchObject({
      code: 'INVALID_PAGINATION',
      path: ['direction'],
    });
    await expect(
      tasks.findMany({
        sort: (s) => s.field('id').asc(),
        cursor: { id: 'A' },
        offset: 0,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_PAGINATION', path: ['cursor'] });
  });
});
