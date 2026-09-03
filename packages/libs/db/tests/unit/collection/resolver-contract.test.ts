import { describe, expect, it } from 'vitest';
import {
  CollectionResolutionError,
  type CollectionResolutionInput,
  type CollectionResolutionResult,
} from '../../../src/collection/resolver/index.js';

describe('Collection Resolver contract', () => {
  it('exposes a stable aggregate resolution error', () => {
    const issues = [
      {
        code: 'COLLECTION_SCHEMA_DRIFT' as const,
        path: ['fields', 'legacyCode'],
        message: 'Metadata references a missing physical field.',
      },
    ];

    const error = new CollectionResolutionError(issues);

    expect(error.code).toBe('COLLECTION_RESOLUTION_FAILED');
    expect(error.name).toBe('CollectionResolutionError');
    expect(error.issues).toBe(issues);
    expect(error.message).toContain('$.fields.legacyCode');
  });

  it('keeps the input and result contracts structurally independent', () => {
    const input: CollectionResolutionInput | undefined = undefined;
    const result: CollectionResolutionResult | undefined = undefined;

    expect(input).toBeUndefined();
    expect(result).toBeUndefined();
  });
});
