import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { serializeToolInputSchema } from '../server/service/tool-input-schema.js';

describe('Tool input schema display serialization', () => {
  it('copies plain JSON schemas deeply without mutating registry definitions', () => {
    const schema = {
      type: 'object',
      properties: {
        query: { type: 'string' },
        choice: { enum: ['a', 'b', null] },
      },
      required: ['query'],
      additionalProperties: false,
    };
    const output = serializeToolInputSchema(schema);
    expect(output).toEqual(schema);
    expect(output).not.toBe(schema);
    expect(output?.properties).not.toBe(schema.properties);
    expect(JSON.parse(JSON.stringify(output))).toEqual(output);
  });

  it('converts Zod schemas to JSON Schema without running refinements or transforms', () => {
    const refinement = vi.fn(() => true);
    const transform = vi.fn((value: string) => value.toUpperCase());
    const schema = z.object({
      query: z.string().refine(refinement).transform(transform),
      limit: z.number().int().min(1).optional(),
    });
    const output = serializeToolInputSchema(schema);
    expect(output).toMatchObject({
      type: 'object',
      properties: {
        query: { type: 'string' },
        limit: { type: 'integer', minimum: 1 },
      },
      required: ['query'],
    });
    expect(JSON.parse(JSON.stringify(output))).toEqual(output);
    expect(refinement).not.toHaveBeenCalled();
    expect(transform).not.toHaveBeenCalled();
    expect(JSON.stringify(output)).not.toMatch(
      /_def|_zod|safeParse|transform|refinement/,
    );
  });

  it('returns null for missing, unsupported or invalid schema objects', () => {
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    for (const schema of [
      undefined,
      null,
      true,
      'string',
      [],
      new Date(),
      new Map(),
      { nested: new Date() },
      { nested: undefined },
      { nested: BigInt(1) },
      { nested: Infinity },
      { nested: NaN },
      { nested: Symbol('schema') },
      cycle,
      z.object({ unsupported: z.date() }),
    ]) {
      expect(serializeToolInputSchema(schema)).toBeNull();
    }
  });

  it('does not call getters, toJSON or embedded functions in plain schemas', () => {
    const accessor = vi.fn(() => 'private-value');
    const toJSON = vi.fn(() => ({ secret: 'private-value' }));
    const invoke = vi.fn();
    for (const schema of [
      Object.defineProperty({ type: 'object' }, 'properties', {
        get: accessor,
        enumerable: true,
      }),
      { type: 'object', toJSON },
      { type: 'object', properties: { implementation: invoke } },
    ]) {
      expect(serializeToolInputSchema(schema)).toBeNull();
    }
    expect(accessor).not.toHaveBeenCalled();
    expect(toJSON).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });
});
