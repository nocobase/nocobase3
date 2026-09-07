import { describe, expect, it } from 'vitest';
import { RepositoryError } from '../../../src/index.js';

describe('RepositoryError', () => {
  it('exposes a stable serializable diagnostic shape', () => {
    const cause = new Error('database detail');
    const error = new RepositoryError(
      'INVALID_UNIQUE_SELECTOR',
      'The selector does not match a unique Field set.',
      {
        collection: 'orders',
        path: ['unique', 'fields'],
        retryable: false,
        details: { fields: ['status'] },
        cause,
      },
    );

    expect(error).toMatchObject({
      name: 'RepositoryError',
      code: 'INVALID_UNIQUE_SELECTOR',
      collection: 'orders',
      path: ['unique', 'fields'],
      retryable: false,
      details: { fields: ['status'] },
      cause,
    });
  });
});
