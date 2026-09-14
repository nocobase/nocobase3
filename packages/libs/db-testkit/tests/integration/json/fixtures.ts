import type { JsonValue } from '../../../../db/src/index.js';

export interface JsonValueFixture {
  readonly id: string;
  readonly payload: JsonValue;
}

/**
 * Every JSON form the portable value contract accepts, in one place so that
 * adding a form reaches all of the value, query, consistency, and round-trip
 * suites at once.
 *
 * The ids are zero-padded and lowercase ASCII so that sorting by them agrees
 * across collations, and the expected order is the declared one.
 *
 * The `string-looks-like-*` entries are the ones worth understanding. A driver
 * that parses JSON itself hands back the decoded string, while a text driver
 * hands back the stored JSON; decoding either without knowing which is which
 * turns a JSON string whose content is itself JSON into an object. They are
 * the only values that tell the two apart.
 */
export const jsonValueFixtures: readonly [
  JsonValueFixture,
  ...JsonValueFixture[],
] = [
  { id: '01-object', payload: { enabled: true, labels: ['one', 'two'] } },
  { id: '02-array', payload: [1, false, { nested: 'value' }] },
  { id: '03-empty-object', payload: {} },
  { id: '04-empty-array', payload: [] },
  { id: '05-deep', payload: { a: { b: [{ c: [1, [2, { d: null }]] }] } } },
  { id: '06-string', payload: 'text' },
  { id: '07-string-empty', payload: '' },
  { id: '08-string-looks-like-object', payload: '{"a":1}' },
  { id: '09-string-looks-like-array', payload: '[1,2]' },
  { id: '10-string-looks-like-null', payload: 'null' },
  { id: '11-string-looks-like-number', payload: '42' },
  { id: '12-string-looks-like-boolean', payload: 'true' },
  { id: '13-string-quotes', payload: 'he said "hi" and \\ left' },
  { id: '14-string-control', payload: 'line\nbreak\ttab' },
  { id: '15-string-unicode', payload: '日本語 café' },
  { id: '16-number-fractional', payload: 42.5 },
  { id: '17-number-zero', payload: 0 },
  { id: '18-number-negative', payload: -3.25 },
  { id: '19-number-max-safe-integer', payload: Number.MAX_SAFE_INTEGER },
  { id: '20-boolean-true', payload: true },
  { id: '21-boolean-false', payload: false },
  { id: '22-database-null', payload: null },
];

/**
 * The subset that a JSON-parsing driver and a text driver disagree about when
 * the decoder guesses instead of being told which one it is talking to.
 */
export const jsonAmbiguousFixtures: readonly JsonValueFixture[] =
  jsonValueFixtures.filter((fixture) =>
    fixture.id.includes('string-looks-like'),
  );

type JsonFixtureRow = { id: string; payload: JsonValue };

/** Bulk mutations take a non-empty tuple, so the shape is preserved here. */
export function jsonFixtureRows(): [JsonFixtureRow, ...JsonFixtureRow[]] {
  const [first, ...rest] = jsonValueFixtures;
  const row = (fixture: JsonValueFixture): JsonFixtureRow => ({
    id: fixture.id,
    payload: fixture.payload,
  });
  return [row(first), ...rest.map(row)];
}
