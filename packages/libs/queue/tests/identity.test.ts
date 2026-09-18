import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createQueueIdentity } from '../src/identity.js';

describe('queue physical identity', () => {
  it.each([
    '',
    ' ',
    '\t',
    '\n',
    '\u0000',
    'a\u001fb',
    '\u007f',
    '\u0080',
    '\u009f',
    'a'.repeat(257),
    '中'.repeat(86),
    null,
    1,
    {},
  ])('rejects invalid name %j on either side', (name) => {
    expect(() => createQueueIdentity(name, 'valid')).toThrow(/namespace/u);
    expect(() => createQueueIdentity('valid', name)).toThrow(/queue/u);
  });

  it.each([
    'a'.repeat(256),
    '中'.repeat(85),
    ' 名称:{Job} ',
    'case',
    'CASE',
    'a:b:c',
    '{}',
    '😃',
  ])('preserves valid logical name %s', (name) => {
    const identity = createQueueIdentity(name, name);
    expect(identity.namespace).toBe(name);
    expect(identity.queue).toBe(name);
    expect(identity.redisQueueName).toBe(
      `q-${Buffer.from(name).toString('base64url')}`,
    );
    expect(identity.redisQueueName).not.toMatch(/[:{}]/u);
  });

  it('uses the specified q-prefixed base64url physical queue name', () => {
    expect(createQueueIdentity('app', 'email').redisQueueName).toBe(
      'q-ZW1haWw',
    );
  });

  it('uses the unambiguous JSON tuple and full SHA-256 for shared physical identities', () => {
    const namespace = 'a:{ns}';
    const queue = '业务:任务';
    const digest = createHash('sha256')
      .update(JSON.stringify([namespace, queue]))
      .digest('hex');
    const identity = createQueueIdentity(namespace, queue);
    expect(identity.digest).toBe(digest);
    expect(identity.redisPrefix).toBe(`nbq:{${digest}}`);
    expect(identity.postgresQueueName).toBe(`q-${digest}`);
    expect(createQueueIdentity(namespace, queue)).toEqual(identity);
  });

  it('keeps tuple boundaries, whitespace, case and Unicode normalization distinct', () => {
    const names = [
      ['a:b', 'c'],
      ['a', 'b:c'],
      ['x', 'job'],
      ['x', 'JOB'],
      [' x', 'job'],
      ['x', 'job '],
      ['x', 'é'],
      ['x', 'e\u0301'],
    ];
    const identities = names.map(([namespace, queue]) =>
      createQueueIdentity(namespace, queue),
    );
    expect(new Set(identities.map((identity) => identity.digest)).size).toBe(
      names.length,
    );
    expect(
      new Set(identities.map((identity) => identity.redisPrefix)).size,
    ).toBe(names.length);
  });
});
