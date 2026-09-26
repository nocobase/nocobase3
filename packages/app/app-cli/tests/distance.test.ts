import { describe, expect, it } from 'vitest';

import {
  closestMatches,
  editDistance,
  matchDistance,
  nearest,
} from '../src/command/distance.ts';

describe('editDistance', () => {
  it('counts insertions, deletions and substitutions', () => {
    expect(editDistance('connection', 'connection')).toBe(0);
    expect(editDistance('conection', 'connection')).toBe(1);
    expect(editDistance('connnection', 'connection')).toBe(1);
    expect(editDistance('cannection', 'connection')).toBe(1);
    expect(editDistance('', 'all')).toBe(3);
    expect(editDistance('all', '')).toBe(3);
  });

  it('counts swapping two adjacent characters as one edit', () => {
    expect(editDistance('froce', 'force')).toBe(1);
    expect(editDistance('jsno', 'json')).toBe(1);
  });

  it('ignores case', () => {
    expect(editDistance('Force', 'force')).toBe(0);
  });
});

describe('matchDistance', () => {
  it('allows one edit for a short name and two for a longer one', () => {
    expect(matchDistance('forse', 'force')).toBe(1);
    expect(matchDistance('fxrse', 'force')).toBeUndefined();
    expect(matchDistance('conecton', 'connection')).toBe(2);
    expect(matchDistance('cnecton', 'connection')).toBeUndefined();
  });

  it('accepts a name the input is a prefix of, from three characters', () => {
    expect(matchDistance('dry', 'dry-run')).toBe(4);
    expect(matchDistance('dr', 'dry-run')).toBeUndefined();
  });
});

describe('closestMatches', () => {
  const flags = ['connection', 'all', 'force', 'json', 'dry-run', 'no-connect'];

  it('suggests the flag that was meant', () => {
    expect(closestMatches('conection', flags)).toEqual(['connection']);
    expect(closestMatches('froce', flags)).toEqual(['force']);
    expect(closestMatches('dry', flags)).toEqual(['dry-run']);
  });

  it('suggests nothing when nothing is close', () => {
    expect(closestMatches('database', flags)).toEqual([]);
  });

  it('orders by distance, then by name, and keeps at most the limit', () => {
    expect(closestMatches('ab', ['ac', 'xb', 'ab-long', 'abc'], 2)).toEqual([
      'abc',
      'ac',
    ]);
  });
});

describe('nearest', () => {
  it('keeps the smallest distance seen for a candidate', () => {
    expect(
      nearest([
        { candidate: 'b', distance: 2 },
        { candidate: 'a', distance: 1 },
        { candidate: 'b', distance: 0 },
      ]),
    ).toEqual(['b', 'a']);
  });
});
