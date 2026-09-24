import { expect, it } from 'vitest';
import {
  decodeAuthorizationTitle,
  encodeAuthorizationTitle,
  parseAuthorizationTitle,
} from '../src/core/index.js';

it('round-trips translated titles and leaves a literal JSON title alone', () => {
  const title = { key: 'roles.reader', ns: 'example' };
  expect(decodeAuthorizationTitle(encodeAuthorizationTitle(title))).toEqual(
    title,
  );
  expect(
    decodeAuthorizationTitle(encodeAuthorizationTitle('{"key":"literal"}')),
  ).toBe('{"key":"literal"}');
});

it('rejects malformed translation descriptors', () => {
  expect(() => parseAuthorizationTitle({ key: 'x' })).toThrow();
  expect(() => parseAuthorizationTitle({ key: '', ns: 'app' })).toThrow();
});
