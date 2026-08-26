import { describe, expect, it } from 'vitest';
import {
  WORKFLOW_CONTEXT_MAX_BYTES,
  WORKFLOW_CONTEXT_SCHEMA_DIALECT,
  WORKFLOW_INVOCATION_SCHEDULING,
  validateContextSchema,
  validateContextValue,
} from '../server/engine/invocation.js';

describe('workflow invocation contract decisions', () => {
  it('freezes scheduling and schema decisions', () => {
    expect(WORKFLOW_CONTEXT_SCHEMA_DIALECT).toBe(
      'https://json-schema.org/draft/2020-12/schema',
    );
    expect(WORKFLOW_CONTEXT_MAX_BYTES).toBe(65_536);
    expect(WORKFLOW_INVOCATION_SCHEDULING).toBe('enqueue');
  });

  it('uses a synchronous local Draft 2020-12 subset', () => {
    expect(
      validateContextSchema({
        type: 'object',
        properties: { id: { $ref: '#/$defs/id' } as never },
      }),
    ).toMatchObject({ valid: false });
    const schema = {
      type: 'object' as const,
      required: ['count'],
      properties: { count: { type: 'number' as const } },
      additionalProperties: false,
    };
    expect(validateContextValue(schema, { count: 0 })).toEqual({
      valid: true,
      issues: [],
    });
    expect(validateContextValue(schema, { count: '0' })).toMatchObject({
      valid: false,
    });
  });
});
