import { describe, expect, it } from 'vitest';
import { CollectionResolutionError } from '../../../src/collection/resolver/errors.js';
import { resolveCollection } from '../../../src/collection/resolver/resolver.js';
import type { CollectionResolutionContext } from '../../../src/collection/resolver/types.js';
import {
  missingFieldDriftFixture,
  ordersResolverFixture,
} from '../../fixtures/resolver/orders.js';

const emptyContext: CollectionResolutionContext = {
  resolvePhysicalCollection: () => undefined,
};

describe('Collection Resolver fixtures', () => {
  it('resolves physical facts with supplemental Metadata', () => {
    const result = resolveCollection({
      physical: structuredClone(ordersResolverFixture.physical),
      metadata: structuredClone(ordersResolverFixture.metadata),
      naming: ordersResolverFixture.naming,
      context: emptyContext,
    });

    expect(result.collection).toMatchObject(ordersResolverFixture.expected);
    expect(result.collection.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'amount',
          type: 'decimal',
          precision: 12,
          scale: 2,
          defaultValue: 0,
          title: 'Order amount',
          description: 'Total amount before refunds.',
        }),
      ]),
    );
    expect(result.collection.indexes).toEqual([
      expect.objectContaining({
        name: 'orders_status_idx',
        fields: ['status'],
      }),
    ]);
  });

  it('reports Metadata that references a missing physical Field', () => {
    expect.assertions(2);
    try {
      resolveCollection({
        physical: structuredClone(missingFieldDriftFixture.physical),
        metadata: structuredClone(missingFieldDriftFixture.metadata),
        naming: missingFieldDriftFixture.naming,
        context: emptyContext,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(CollectionResolutionError);
      expect((error as CollectionResolutionError).issues).toEqual(
        expect.arrayContaining(
          missingFieldDriftFixture.expectedIssues.map((issue) =>
            expect.objectContaining(issue),
          ),
        ),
      );
    }
  });
});
