import { describe, expect, it } from 'vitest';
import {
  normalizeEvent,
  normalizeResourceRef,
  type EventNormalizationContext,
} from '../../server/event-normalizer.js';

const context: EventNormalizationContext = Object.freeze({
  scope: Object.freeze({
    appId: 'app-a',
    securityScope: 'tenant-a',
    actor: Object.freeze({ type: 'workflow', id: 'workflow-1' }),
    initiator: Object.freeze({ type: 'user', id: 'user-1' }),
    roleIds: Object.freeze(['b', 'a']),
  }),
  kind: 'business',
  producer: 'test-runtime',
  id: 'event-1',
  store: 'audit-store',
  policyVersion: 1,
  occurredAt: '2026-09-05T12:00:00.000Z',
  recordedAt: '2026-09-05T12:00:01.000Z',
});
const input = Object.freeze({
  action: 'order.approve',
  outcome: 'success',
  target: Object.freeze({
    dataSource: 'business-store',
    resource: 'orders',
    key: Object.freeze({ z: 1, a: '1' }),
  }),
  details: Object.freeze({
    count: 1,
    nested: Object.freeze({ password: 'SYNTHETIC-PAYLOAD-SECRET', ok: true }),
  }),
});

describe('event normalizer', () => {
  it('uses the trusted context without mutating frozen event or scope', () => {
    const result = normalizeEvent(input, context);
    expect(result.event).toMatchObject({
      kind: 'business',
      actor: { type: 'workflow' },
      initiator: { type: 'user' },
      appId: 'app-a',
      roleIds: ['a', 'b'],
      details: { count: 1, nested: { ok: true } },
      store: 'audit-store',
      target: { dataSource: 'business-store' },
    });
    expect(result.target).toMatchObject({
      appId: 'app-a',
      securityScope: 'tenant-a',
    });
    expect(JSON.stringify(result)).not.toContain('SYNTHETIC-PAYLOAD-SECRET');
    expect(input.details.nested.password).toBe('SYNTHETIC-PAYLOAD-SECRET');
    expect(context.scope.roleIds).toEqual(['b', 'a']);
    expect(result.event.actor).not.toBe(context.scope.actor);
  });
  it.each([
    'kind',
    'producer',
    'appId',
    'actor',
    'initiator',
    'securityScope',
    'id',
    'eventVersion',
    'roleIds',
    'operationId',
    'requestId',
    'runId',
    'correlationId',
    'store',
    'occurredAt',
    'recordedAt',
    'policyVersion',
    'eventId',
    'unknown',
  ])('rejects injected field %s', (key) => {
    expect(() =>
      normalizeEvent({ ...input, [key]: 'SYNTHETIC-PAYLOAD-SECRET' }, context),
    ).toThrow('AUDIT_INVALID_EVENT');
  });
  it.each([
    {},
    { action: 'a' },
    { action: '', outcome: 'success' },
    { action: 'a', outcome: 'ok' },
    { action: 'x'.repeat(1025), outcome: 'success' },
    { action: 'a\n', outcome: 'success' },
    { action: 'a', outcome: 'success', details: [] },
    { action: 'a', outcome: 'success', details: { value: NaN } },
  ])('rejects invalid event %o', (value) => {
    expect(() => normalizeEvent(value, context)).toThrow('AUDIT_INVALID_EVENT');
  });
  it('does not execute event/resource getters and rejects scope injection into resources', () => {
    let calls = 0;
    expect(() =>
      normalizeEvent(
        {
          get action(): string {
            calls++;
            throw new Error('secret');
          },
          outcome: 'success',
        },
        context,
      ),
    ).toThrow('AUDIT_INVALID_EVENT');
    expect(() =>
      normalizeEvent(
        {
          ...input,
          target: {
            resource: 'x',
            get key(): string {
              calls++;
              return 'x';
            },
          },
        },
        context,
      ),
    ).toThrow('AUDIT_INVALID_EVENT');
    expect(() =>
      normalizeEvent(
        { ...input, target: { resource: 'x', appId: 'foreign' } },
        context,
      ),
    ).toThrow('AUDIT_INVALID_EVENT');
    expect(calls).toBe(0);
  });
  it('keeps missing identity unknown and explicit anonymous identity intact', () => {
    expect(
      normalizeEvent(input, {
        ...context,
        scope: Object.assign({
          appId: 'a',
        }) as EventNormalizationContext['scope'],
      }).event.actor,
    ).toEqual({ type: 'unknown' });
    expect(
      normalizeEvent(input, {
        ...context,
        scope: { appId: 'a', actor: { type: 'anonymous' } },
      }).event.actor.type,
    ).toBe('anonymous');
  });
  it('preserves composite key types and sorts names deterministically', () => {
    const first = normalizeResourceRef(
      { resource: 'x', key: { z: 1, a: '1' } },
      context.scope,
    );
    const second = normalizeResourceRef(
      { resource: 'x', key: { a: '1', z: 1 } },
      context.scope,
    );
    expect(first).toEqual(second);
    expect(
      normalizeResourceRef(
        { resource: 'x', key: '汉'.repeat(1000) },
        context.scope,
      ).keyEncoding,
    ).toContain('汉'.repeat(1000));
    expect(first.keyHash).not.toBe(
      normalizeResourceRef(
        { resource: 'x', key: { z: '1', a: '1' } },
        context.scope,
      ).keyHash,
    );
    expect(
      normalizeResourceRef(
        { resource: 'x', key: '9007199254740993123456789' },
        context.scope,
      ).keyEncoding,
    ).toContain('9007199254740993123456789');
    expect(() =>
      normalizeResourceRef(
        { resource: 'x', key: { id: 9007199254740992 } },
        context.scope,
      ),
    ).toThrow('AUDIT_INVALID_EVENT');
  });
  it('rejects malformed keys without stringifying arbitrary objects', () => {
    for (const key of [
      {},
      { id: NaN },
      { id: Infinity },
      { id: true },
      { id: 1n },
      1,
      'x'.repeat(65537),
    ]) {
      expect(() =>
        normalizeEvent({ ...input, target: { resource: 'x', key } }, context),
      ).toThrow('AUDIT_INVALID_EVENT');
    }
  });
  it('excludes generated IDs, server times and policy revision from business fingerprints', () => {
    const first = normalizeEvent(input, context);
    const retry = normalizeEvent(input, {
      ...context,
      id: 'event-2',
      occurredAt: '2026-09-06T12:00:00.000Z',
      recordedAt: '2026-09-06T12:00:01.000Z',
      policyVersion: 2,
    });
    expect(first.fingerprint).toBe(retry.fingerprint);
    expect(first.fingerprint).not.toBe(
      normalizeEvent({ ...input, details: { count: 2 } }, context).fingerprint,
    );
    expect(first.fingerprint).not.toBe(
      normalizeEvent({ ...input, outcome: 'failed' }, context).fingerprint,
    );
    expect(first.fingerprint).not.toBe(
      normalizeEvent(input, {
        ...context,
        scope: { ...context.scope, appId: 'b' },
      }).fingerprint,
    );
  });
  it('canonicalizes details, role order and key order but preserves key names and types', () => {
    const first = normalizeEvent(
      {
        action: 'a',
        outcome: 'success',
        details: { a: 1, z: 2 },
        target: { resource: 'x', key: { token: '1', id: 1 } },
      },
      context,
    );
    const second = normalizeEvent(
      {
        action: 'a',
        outcome: 'success',
        details: { z: 2, a: 1 },
        target: { resource: 'x', key: { id: 1, token: '1' } },
      },
      { ...context, scope: { ...context.scope, roleIds: ['a', 'b', 'a'] } },
    );
    expect(first.fingerprint).toBe(second.fingerprint);
    expect(first.fingerprint).not.toBe(
      normalizeEvent(
        {
          action: 'a',
          outcome: 'success',
          details: { a: 1, z: 2 },
          target: { resource: 'x', key: { token: '2', id: 1 } },
        },
        context,
      ).fingerprint,
    );
  });
  it('validates trusted metadata and strict payload limits', () => {
    expect(() =>
      normalizeEvent(input, {
        ...context,
        occurredAt: '2026-02-30T12:00:00.000Z',
      }),
    ).toThrow('AUDIT_INVALID_EVENT');
    expect(() =>
      normalizeEvent(input, { ...context, policyVersion: NaN }),
    ).toThrow('AUDIT_INVALID_EVENT');
    expect(() => normalizeEvent(input, context, { maxBytes: 2 })).toThrow(
      'AUDIT_INVALID_EVENT',
    );
  });
  it('rejects revoked details proxies with the stable audit error', () => {
    const revoked = Proxy.revocable({}, {});
    revoked.revoke();
    expect(() =>
      normalizeEvent({ ...input, details: revoked.proxy }, context),
    ).toThrow('AUDIT_INVALID_EVENT');
  });
  it('accepts the configured depth boundary without fingerprint wrapper penalties', () => {
    let nested: unknown = 1;
    for (let i = 0; i < 128; i++) nested = { child: nested };
    expect(
      normalizeEvent(
        { action: 'a', outcome: 'accepted', details: nested },
        context,
        { maxDepth: 128 },
      ).event.outcome,
    ).toBe('accepted');
  });
  it('changes fingerprints for producer, store, scope, actor and resource type changes', () => {
    const fingerprint = normalizeEvent(input, context).fingerprint;
    for (const changed of [
      { ...context, producer: 'other' },
      { ...context, store: 'other' },
      { ...context, scope: { ...context.scope, securityScope: 'other' } },
      {
        ...context,
        scope: { ...context.scope, actor: { type: 'user', id: 'other' } },
      },
    ])
      expect(normalizeEvent(input, changed).fingerprint).not.toBe(fingerprint);
    expect(
      normalizeEvent(
        { ...input, target: { ...input.target, key: { z: '1', a: '1' } } },
        context,
      ).fingerprint,
    ).not.toBe(fingerprint);
  });
});
