import { describe, expect, it } from 'vitest';
import {
  assertCollectionArtifactDirectoryNames,
  CollectionArtifactNameError,
  findCollectionArtifactNameConflicts,
  validateCollectionArtifactDirectoryName,
} from '../../../src/index.js';

function codeOf(fn: () => void): string | undefined {
  try {
    fn();
    return undefined;
  } catch (error) {
    return error instanceof CollectionArtifactNameError ? error.code : 'other';
  }
}

describe('validateCollectionArtifactDirectoryName', () => {
  it('accepts ordinary logical names', () => {
    for (const name of [
      'orders',
      'dailyMetrics',
      'order_items',
      'v2-events',
      '文章',
    ]) {
      expect(() => validateCollectionArtifactDirectoryName(name)).not.toThrow();
    }
  });

  it.each([
    ['', 'empty'],
    ['.', 'relative path segment'],
    ['..', 'relative path segment'],
    ['a/b', 'path separator'],
    ['a\\b', 'path separator'],
    ['.hidden', 'starts with a dot'],
    ['_manifest', 'reserved for connection-level files'],
    [' orders', 'surrounding whitespace'],
    ['orders.', 'ends with a dot'],
    ['bad\tname', 'control characters'],
    ['what?', 'Windows forbids'],
    ['CON', 'reserved device name'],
    ['lpt3', 'reserved device name'],
  ])('rejects %j (%s)', (name, reason) => {
    expect(() => validateCollectionArtifactDirectoryName(name)).toThrow(
      new RegExp(reason.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    );
    expect(codeOf(() => validateCollectionArtifactDirectoryName(name))).toBe(
      'COLLECTION_ARTIFACT_NAME_INVALID',
    );
  });
});

describe('findCollectionArtifactNameConflicts', () => {
  it('groups names that differ only by case', () => {
    expect(
      findCollectionArtifactNameConflicts([
        'orders',
        'Orders',
        'articles',
        'ORDERS',
        'users',
        'Users',
      ]),
    ).toEqual([
      ['ORDERS', 'Orders', 'orders'],
      ['Users', 'users'],
    ]);
  });

  it('reports nothing for distinct names', () => {
    expect(findCollectionArtifactNameConflicts(['orders', 'articles'])).toEqual(
      [],
    );
  });
});

describe('assertCollectionArtifactDirectoryNames', () => {
  it('validates every name before looking for conflicts', () => {
    expect(
      codeOf(() => assertCollectionArtifactDirectoryNames(['ok', '.bad'])),
    ).toBe('COLLECTION_ARTIFACT_NAME_INVALID');
  });

  it('reports every conflicting group in one error', () => {
    let caught: unknown;
    try {
      assertCollectionArtifactDirectoryNames([
        'orders',
        'Orders',
        'users',
        'USERS',
      ]);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(CollectionArtifactNameError);
    const error = caught as CollectionArtifactNameError;
    expect(error.code).toBe('COLLECTION_ARTIFACT_NAME_CONFLICT');
    expect(error.names).toEqual(['Orders', 'orders', 'USERS', 'users']);
    expect(error.message).toContain('Orders / orders');
    expect(error.message).toContain('USERS / users');
  });
});
