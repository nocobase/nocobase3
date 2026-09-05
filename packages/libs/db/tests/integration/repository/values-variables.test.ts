import { expect, it } from 'vitest';
import type { Repository, ValuesBuilder } from '../../../src/index.js';
import {
  describeIntegrationDatabases,
  type IntegrationTestContext,
} from '../helpers.js';

interface Entry {
  code: string;
  title: string;
  points: number;
  metadata: Record<string, unknown> | null;
}

function jsonValue(value: unknown): unknown {
  return typeof value === 'string' ? JSON.parse(value) : value;
}

async function fixture(
  context: IntegrationTestContext,
): Promise<Repository<Entry>> {
  await context.builder.createCollection('variableEntries', (c) => {
    c.string('code').primary().notNull();
    c.string('title').notNull();
    c.integer('points').notNull();
    c.json('metadata').nullable();
  });
  return context.database.repository<Entry>('variableEntries');
}

describeIntegrationDatabases('Repository values variables', (context) => {
  it('resolves create callbacks, batch rows, and literal JSON without interpreting data twice', async () => {
    const entries = await fixture(context);
    const marker = { kind: 'variable', path: '$notResolved' };
    const inputContext = Object.freeze({
      input: Object.freeze({
        code: 'A',
        title: 'First',
        points: 2,
        metadata: marker,
      }),
    });
    const created = (
      await entries.createOne({
        values: (v) => ({
          code: v.variable('$input.code'),
          title: v.variable('$input.title'),
          points: v.variable('$input.points'),
          metadata: v.variable('$input.metadata'),
        }),
        context: inputContext,
      })
    ).record;
    expect({ ...created, metadata: jsonValue(created.metadata) }).toEqual({
      code: 'A',
      title: 'First',
      points: 2,
      metadata: marker,
    });
    const batch = await entries.createMany({
      values: (v) => [
        {
          code: 'B',
          title: v.variable('$input.title'),
          points: 3,
          metadata: v.literal(marker),
        },
        {
          code: 'C',
          title: 'Third',
          points: v.literal(4),
          metadata: { expression: marker },
        },
      ],
      select: (s) => s.fields('code', 'metadata'),
      context: inputContext,
    });
    expect({
      ...batch,
      records: batch.records.map((r) => ({
        ...r,
        metadata: jsonValue(r.metadata),
      })),
    }).toEqual({
      createdCount: 2,
      records: [
        { code: 'B', metadata: marker },
        { code: 'C', metadata: { expression: marker } },
      ],
    });
    expect(
      jsonValue(
        (
          await entries.createOne({
            values: {
              code: 'D',
              title: { kind: 'variable', path: '$title' },
              points: 1,
              metadata: {
                kind: 'literal',
                value: { kind: 'literal', value: marker },
              },
            },
            context: { title: 'JSON input' },
          })
        ).record.metadata,
      ),
    ).toEqual({ kind: 'literal', value: marker });
    expect(
      await entries.validateMutation({
        operation: 'createOne',
        values: (v) => ({ code: v.variable('$input.code') }),
        context: inputContext,
      }),
    ).toEqual({ valid: true, errors: [] });
  });

  it('resolves updates, atomic operands and both root upsert branches', async () => {
    const entries = await fixture(context);
    const create = (v: ValuesBuilder) => ({
      code: v.variable('$code'),
      title: v.variable('$title'),
      points: 2,
    });
    const update = (v: ValuesBuilder) => ({
      title: v.variable('$title'),
      points: { increment: v.variable('$delta') },
    });
    const filter = { code: 'A' };
    await entries.upsertOne({
      filter,
      create,
      update,
      context: { code: 'A', title: 'Created', delta: 3 },
    });
    expect(
      (
        await entries.upsertOne({
          filter,
          create,
          update,
          context: { code: 'A', title: 'Updated', delta: 3 },
        })
      ).record,
    ).toMatchObject({ code: 'A', title: 'Updated', points: 5 });
    expect(
      (
        await entries.updateOne({
          filter,
          values: (v) => ({ points: (p) => p.multiply(v.variable('$factor')) }),
          context: { factor: 2 },
        })
      ).record.points,
    ).toBe(10);
    expect(
      await entries.updateMany({
        all: true,
        values: (v) => ({
          points: { decrement: v.variable('$delta') },
          title: v.variable('$title'),
        }),
        context: { delta: 2, title: 'Batch' },
        select: (s) => s.fields('points', 'title'),
      }),
    ).toEqual({ updatedCount: 1, records: [{ points: 8, title: 'Batch' }] });
    await expect(
      entries.updateOne({
        filter,
        values: (v) => ({ points: v.variable('$operation') }),
        context: { operation: { increment: 100 } },
      }),
    ).rejects.toMatchObject({
      code: 'INVALID_MUTATION',
      path: ['values', 'points'],
      details: { variable: '$operation' },
    });
    await expect(
      entries.updateOne({
        filter,
        values: (v) => ({ points: { divide: v.variable('$zero') } }),
        context: { zero: 0 },
      }),
    ).rejects.toMatchObject({
      code: 'INVALID_MUTATION',
      details: { variable: '$zero' },
    });
    expect((await entries.findOne({ filter }))?.points).toBe(8);
  });

  it('rejects unresolved, malformed, inherited and wrong-type variables before writes', async () => {
    const entries = await fixture(context);
    for (const value of [undefined, 'not a number', null]) {
      const result = await entries.validateMutation({
        operation: 'createOne',
        values: (v) => ({
          code: 'A',
          title: 'Title',
          points: v.variable('$points'),
        }),
        context: { points: value },
      });
      expect(result).toMatchObject({
        valid: false,
        errors: [
          { path: ['values', 'points'], details: { variable: '$points' } },
        ],
      });
    }
    const inherited = Object.create({ points: 2 }) as Record<string, unknown>;
    await expect(
      entries.createOne({
        values: (v) => ({ code: 'A', points: v.variable('$points') }),
        context: inherited,
      }),
    ).rejects.toMatchObject({ code: 'VARIABLE_NOT_FOUND' });
    await expect(
      entries.createOne({
        values: (v) => ({ code: 'A', points: v.variable('$input..points') }),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_CONTEXT' });
    await expect(
      entries.createMany({
        values: (v) => [
          { code: 'A', title: 'Good', points: 1 },
          { code: 'B', title: v.variable('$missing'), points: 2 },
        ],
      }),
    ).rejects.toMatchObject({
      code: 'VARIABLE_NOT_FOUND',
      path: ['values', 1, 'title'],
    });
    await expect(
      entries.createOne({
        values: (() => Promise.resolve({ code: 'A' })) as never,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_MUTATION' });
    await expect(
      entries.createMany({ values: (() => []) as never }),
    ).rejects.toMatchObject({ code: 'INVALID_MUTATION' });
    expect(await entries.count()).toBe(0);
  });
});
