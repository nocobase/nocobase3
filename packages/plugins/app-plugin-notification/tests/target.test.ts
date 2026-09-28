import { describe, expect, it } from 'vitest';
import {
  isNotificationTarget,
  validateNotificationTarget,
} from '../shared/target.js';

describe('notification targets', () => {
  it.each(['/topics/123', '/topics/123?q=hello%20world#reply', '/'])(
    'accepts internal route %s',
    (path) => {
      expect(validateNotificationTarget({ type: 'route', path })).toEqual({
        type: 'route',
        path,
      });
    },
  );
  it.each([
    'https://example.com/main/topics/123',
    'http://localhost:13000/main/topics/123?q=1#reply',
  ])('accepts complete URL %s', (url) => {
    expect(validateNotificationTarget({ type: 'url', url })).toEqual({
      type: 'url',
      url,
    });
  });
  it.each([
    { type: 'route', path: '//example.com' },
    { type: 'route', path: 'topics/123' },
    { type: 'route', path: '/\\example.com' },
    { type: 'route', path: '/topic\n/123' },
    { type: 'url', url: '/main/topics/123' },
    { type: 'url', url: '//example.com' },
    { type: 'url', url: 'javascript:alert(1)' },
    { type: 'url', url: 'data:text/html,test' },
    { type: 'url', url: 'https://' },
    { type: 'url', url: 'https://user:pass@example.com' },
    { type: 'url', url: 'https://example.com\\other' },
    { type: 'unknown', path: '/' },
    '',
    {},
  ])('rejects invalid target %j', (target) => {
    expect(isNotificationTarget(target)).toBe(false);
    expect(() => validateNotificationTarget(target)).toThrow(
      'Invalid notification target',
    );
  });
  it('allows an absent target', () => {
    expect(validateNotificationTarget(undefined)).toBeUndefined();
    expect(validateNotificationTarget(null)).toBeUndefined();
  });
});
