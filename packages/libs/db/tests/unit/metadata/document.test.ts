import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  defineCollectionMetadata,
  type CollectionMetadataDocument,
} from '../../../src/index.js';

describe('defineCollectionMetadata', () => {
  it('preserves the document value and its inferred type', () => {
    const document = {
      version: 1 as const,
      name: 'orders',
      title: 'Orders',
    };

    const defined = defineCollectionMetadata(document);

    expect(defined).toBe(document);
    expectTypeOf(defined).toEqualTypeOf<typeof document>();
    expectTypeOf(defined).toMatchTypeOf<CollectionMetadataDocument>();
  });

  it('does not perform runtime validation', () => {
    const document = defineCollectionMetadata({
      version: 1,
      name: 'orders',
      extra: 'retained by the type helper',
    });

    expect(document).toHaveProperty('extra');
  });
});
