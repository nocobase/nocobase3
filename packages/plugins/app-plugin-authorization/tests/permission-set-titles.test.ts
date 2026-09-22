import { expect, it } from 'vitest';
import {
  parseAuthorizationTitle,
  encodeAuthorizationTitle,
  decodeAuthorizationTitle,
} from '@nocobase/authorization/core';
import { fromSet, toInput } from '../client/pages/permission-sets/drafts.js';
it('round-trips translated titles and preserves them until renamed', () => {
  const title = { key: 'roles.reader', ns: 'example' };
  expect(decodeAuthorizationTitle(encodeAuthorizationTitle(title))).toEqual(
    title,
  );
  const draft = fromSet({ key: 'reader', title, grants: [] }, () => 'Reader');
  expect(toInput(draft).title).toEqual(title);
  expect(toInput({ ...draft, title: 'My team' }).title).toBe('My team');
  expect(
    decodeAuthorizationTitle(encodeAuthorizationTitle('{"key":"literal"}')),
  ).toBe('{"key":"literal"}');
});
it('rejects malformed translation descriptors', () => {
  expect(() => parseAuthorizationTitle({ key: 'x' })).toThrow();
  expect(() => parseAuthorizationTitle({ key: '', ns: 'app' })).toThrow();
});
