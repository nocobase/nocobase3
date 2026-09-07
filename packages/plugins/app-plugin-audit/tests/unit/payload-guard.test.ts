import { describe, expect, it, vi } from 'vitest';
import { guardPayload, requirePayload } from '../../server/payload-guard.js';
import { AuditError } from '../../server/errors.js';

const secret = 'SYNTHETIC-G04-SECRET-DO-NOT-LEAK';
describe('payload guard', () => {
  it('removes nested secrets from copied output, errors and log snapshots', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const input = Object.freeze({
      safe: Object.freeze([
        Object.freeze({
          TOKEN: secret,
          password: secret,
          cookie: secret,
          privateKey: secret,
          private_key: secret,
          'set-cookie': secret,
          authorization: secret,
          apiKey: secret,
          clientSecret: secret,
          nested: Object.freeze({ access_token: secret, ok: true }),
        }),
      ]),
    });
    const result = guardPayload(input);
    expect(result).toMatchObject({
      ok: true,
      value: { safe: [{ nested: { ok: true } }] },
    });
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(input.safe[0]?.TOKEN).toBe(secret);
    let error: unknown;
    try {
      requirePayload({ [secret]: () => secret });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(AuditError);
    expect(String(error)).toBe('AuditError: AUDIT_INVALID_EVENT');
    expect(JSON.stringify(error)).not.toContain(secret);
    expect(log.mock.calls).toEqual([]);
    log.mockRestore();
  });
  it('keeps free text and strips prototype pollution keys', () => {
    expect(requirePayload({ notes: secret })).toEqual({ notes: secret });
    const input: unknown = JSON.parse(
      '{"__proto__":{"polluted":true},"constructor":{},"prototype":{},"ok":1}',
    );
    const result = requirePayload(input);
    expect(result).toEqual({ ok: 1 });
    expect(Object.getPrototypeOf(result)).toBeNull();
    expect(Object.hasOwn({}, 'polluted')).toBe(false);
  });
  it('copies deeply frozen inputs and shared references', () => {
    const shared = Object.freeze({ a: 1 });
    const input = Object.freeze({
      list: Object.freeze([shared, shared]),
      nested: shared,
    });
    const output = requirePayload(input);
    expect(output).toEqual(input);
    expect(output).not.toBe(input);
    if (output && typeof output === 'object')
      expect(Reflect.get(output, 'nested')).not.toBe(shared);
  });
  it.each([
    ['non-finite-number', NaN],
    ['non-finite-number', Infinity],
    ['non-finite-number', -Infinity],
    ['unsupported-type', undefined],
    ['unsupported-type', () => 1],
    ['unsupported-type', Symbol('x')],
    ['unsupported-type', new Date()],
    ['unsupported-type', new Map()],
    ['unsupported-type', /x/],
    [
      'unsupported-type',
      new (class Decimal {
        toString(): string {
          throw new Error(secret);
        }
      })(),
    ],
  ])('rejects %s predictably', (issue, value) => {
    expect(guardPayload({ value })).toEqual({
      ok: false,
      value: null,
      issues: [issue],
    });
  });
  it('converts BigInt losslessly and keeps explicit Decimal strings', () => {
    expect(
      requirePayload({
        integer: 9007199254740993123456789n,
        decimal: '123456789.00000000000000001',
      }),
    ).toEqual({
      integer: '9007199254740993123456789',
      decimal: '123456789.00000000000000001',
    });
  });
  it('never invokes getters, toJSON or proxy traps including revoked proxies', () => {
    let calls = 0;
    const accessor = {
      get value(): string {
        calls++;
        throw new Error(secret);
      },
    };
    const toJSON = {
      toJSON(): string {
        calls++;
        throw new Error(secret);
      },
    };
    const proxy = new Proxy(
      {},
      {
        ownKeys() {
          calls++;
          throw new Error(secret);
        },
      },
    );
    const revoked = Proxy.revocable({}, {});
    revoked.revoke();
    expect(guardPayload(accessor)).toMatchObject({
      ok: false,
      issues: ['accessor'],
    });
    for (const value of [toJSON, proxy, revoked.proxy])
      expect(guardPayload(value)).toMatchObject({
        ok: false,
        issues: ['unsupported-type'],
      });
    expect(
      guardPayload({
        get password(): string {
          calls++;
          throw new Error(secret);
        },
      }),
    ).toMatchObject({ ok: true, value: {} });
    expect(calls).toBe(0);
  });
  it('rejects cycles with a safe minimal result', () => {
    const input: Record<string, unknown> = { safe: true };
    input.self = input;
    expect(guardPayload(input)).toEqual({
      ok: false,
      value: null,
      issues: ['cycle'],
    });
    expect(() => requirePayload(input)).toThrow('AUDIT_INVALID_EVENT');
  });
  it('enforces exact UTF-8 JSON bytes including escaping and property names', () => {
    const input = { 中文: '🙂\n' };
    const bytes = Buffer.byteLength(JSON.stringify(input), 'utf8');
    expect(guardPayload(input, { maxBytes: bytes })).toMatchObject({
      ok: true,
      bytes,
    });
    expect(guardPayload(input, { maxBytes: bytes - 1 })).toEqual({
      ok: false,
      value: null,
      issues: ['byte-limit'],
    });
    expect(guardPayload('x'.repeat(65_534))).toMatchObject({
      ok: true,
      bytes: 65_536,
    });
    expect(guardPayload('x'.repeat(65_535))).toMatchObject({
      ok: false,
      issues: ['byte-limit'],
    });
    expect(guardPayload({ token: secret }, { maxBytes: 2 })).toMatchObject({
      ok: true,
      bytes: 2,
    });
  });
  it('bounds depth and total keys including arrays and stripped keys', () => {
    expect(guardPayload({ a: { b: 1 } }, { maxDepth: 2 })).toMatchObject({
      ok: true,
    });
    expect(guardPayload({ a: { b: 1 } }, { maxDepth: 1 })).toMatchObject({
      ok: false,
      issues: ['depth-limit'],
    });
    expect(guardPayload({ a: [1, 2] }, { maxKeys: 3 })).toMatchObject({
      ok: true,
    });
    expect(guardPayload({ a: [1, 2] }, { maxKeys: 2 })).toMatchObject({
      ok: false,
      issues: ['key-limit'],
    });
    expect(
      guardPayload({ token: secret, password: secret }, { maxKeys: 1 }),
    ).toMatchObject({ ok: false, issues: ['key-limit'] });
    let deep: unknown = null;
    for (let i = 0; i < 10_000; i++) deep = { nested: deep };
    expect(guardPayload(deep)).toMatchObject({
      ok: false,
      issues: ['depth-limit'],
    });
  });
  it('rejects sparse arrays, array getters, extra properties and symbols', () => {
    expect(guardPayload(new Array(1_000_000))).toMatchObject({
      ok: false,
      issues: ['key-limit'],
    });
    expect(guardPayload(new Array(2))).toMatchObject({
      ok: false,
      issues: ['unsupported-type'],
    });
    expect(guardPayload(Object.assign([1], { extra: 2 }))).toMatchObject({
      ok: false,
    });
    const input = [1];
    Object.defineProperty(input, '0', {
      get() {
        throw new Error(secret);
      },
    });
    expect(guardPayload(input)).toMatchObject({
      ok: false,
      issues: ['accessor'],
    });
    expect(guardPayload({ [Symbol('x')]: 1 })).toMatchObject({
      ok: false,
      issues: ['unsupported-type'],
    });
  });
  it.each([
    { maxBytes: 0 },
    { maxBytes: NaN },
    { maxDepth: 129 },
    { maxDepth: -1 },
    { maxKeys: 0 },
    { maxKeys: Infinity },
  ])('rejects invalid limits %o', (limits) => {
    expect(guardPayload({}, limits)).toEqual({
      ok: false,
      value: null,
      issues: ['invalid-limits'],
    });
  });
  it('canonicalizes property order and negative zero', () => {
    expect(guardPayload({ z: -0, a: { b: 1, a: 2 } })).toEqual(
      guardPayload({ a: { a: 2, b: 1 }, z: 0 }),
    );
  });
  it('bounds wide objects and huge property names before copying values', () => {
    const wide = Object.fromEntries(
      Array.from({ length: 10_000 }, (_, i) => [String(i), 1]),
    );
    expect(guardPayload(wide)).toMatchObject({
      ok: false,
      issues: ['key-limit'],
    });
    expect(guardPayload({ ['x'.repeat(100_000)]: 1 })).toMatchObject({
      ok: false,
      issues: ['byte-limit'],
    });
  });
  it('bounds huge positive and negative BigInts before decimal conversion', () => {
    const huge = 1n << 1_000_000n;
    expect(guardPayload(huge)).toMatchObject({
      ok: false,
      issues: ['byte-limit'],
    });
    expect(guardPayload(-huge)).toMatchObject({
      ok: false,
      issues: ['byte-limit'],
    });
    expect(guardPayload(-12n, { maxBytes: 5 })).toMatchObject({
      ok: true,
      value: '-12',
      bytes: 5,
    });
  });
});
