import { describe, expect, it } from 'vitest';
import { andFilters, assertDatabaseFilter, orFilters } from '../src/index.js';

describe('database Filter AST', () => {
  it('combines filters', () => {
    const filter = andFilters([
      {
        $and: [{ ownerId: { $eq: 'alice' } }],
      },
      orFilters([
        { $and: [{ status: { $eq: 'paid' } }] },
        { $and: [{ amount: { $gte: 100 } }] },
      ]),
    ]);

    expect(filter).toEqual({
      $and: [
        { $and: [{ ownerId: { $eq: 'alice' } }] },
        {
          $or: [
            { $and: [{ status: { $eq: 'paid' } }] },
            { $and: [{ amount: { $gte: 100 } }] },
          ],
        },
      ],
    });
  });

  it('rejects unknown fields and operators', () => {
    expect(() =>
      assertDatabaseFilter({ $and: [{ missing: { $eq: 'value' } }] }, [
        'id',
        'status',
      ]),
    ).toThrow(/Unknown Database Filter field: missing/);

    expect(() =>
      assertDatabaseFilter({ $and: [{ status: { $raw: 'value' } }] }, [
        'id',
        'status',
      ]),
    ).toThrow(/Unsupported Database Filter operator: \$raw/);
  });
});
