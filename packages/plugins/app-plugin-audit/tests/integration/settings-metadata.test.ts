import { afterEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import {
  createSettingsFixture,
  type SettingsFixture,
} from '../helpers/settings-fixture.js';
import type {
  AuditSettingsResponse,
  AuditHealthDto,
} from '../../server/contracts.js';
import { auditRaw, dialects } from '../helpers/database-fixtures.js';

const fixtures: SettingsFixture[] = [];
afterEach(async () => {
  for (const f of fixtures.splice(0)) await f.cleanup();
});

describe.each(dialects)('metadata real API (%s)', (dialect) => {
  it('rejects a concurrent policy update during old-scope authorization', async () => {
    const f = await createSettingsFixture(dialect);
    fixtures.push(f);
    await f.grant(f.alice.id, [], ['read', 'manage']);
    const initial = await f.settings.get(f.f.scope);
    const original = f.resources.authorization.require.bind(
      f.resources.authorization,
    );
    let checks = 0;
    const authorization = vi
      .spyOn(f.resources.authorization, 'require')
      .mockImplementation(async (...args) => {
        if (args[3] === 'manage' && ++checks === 2) {
          await f.settings.update(f.f.scope, {
            expectedRevision: initial.revision,
            settings: { ...initial, retentionDays: 300 },
            confirmRetentionReduction: false,
          });
        }
        return original(...args);
      });
    try {
      const response = await f.request('/settings?store=main', undefined, {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          'if-match': '"' + initial.revision + '"',
        },
        body: JSON.stringify({
          expectedRevision: initial.revision,
          settings: { ...initial, retentionDays: 250 },
          confirmRetentionReduction: false,
        }),
      });
      expect(response.status).toBe(409);
      expect(await f.settings.get(f.f.scope)).toMatchObject({
        revision: initial.revision + 1,
        retentionDays: 300,
      });
    } finally {
      authorization.mockRestore();
    }
  });
  it('requires management of removed stores and leaves the persisted revision untouched', async () => {
    const f = await createSettingsFixture(dialect, false, false, true);
    fixtures.push(f);
    await f.grant(f.alice.id, [], ['read', 'manage']);
    const initial = await f.settings.get(f.f.scope);
    const configured = await f.settings.update(f.f.scope, {
      expectedRevision: initial.revision,
      settings: {
        ...initial,
        enabled: false,
        sources: {
          ...initial.sources,
          database: [{ dataSource: 'other', table: 'protected_table' }],
        },
      },
      confirmRetentionReduction: false,
    });
    expect((await f.request('/settings?store=main')).status).toBe(403);
    const response = await f.request('/settings?store=main', undefined, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        'if-match': '"' + configured.revision + '"',
      },
      body: JSON.stringify({
        expectedRevision: configured.revision,
        settings: {
          ...configured,
          sources: { ...configured.sources, database: [] },
        },
        confirmRetentionReduction: false,
      }),
    });
    expect(response.status).toBe(403);
    expect(await f.settings.get(f.f.scope)).toEqual(configured);
  });
  it('does not disclose an unauthorized target and does not disguise ACL failures as read-only', async () => {
    const f = await createSettingsFixture(dialect);
    fixtures.push(f);
    await f.grant(f.alice.id, [], ['read', 'manage']);
    const original = f.resources.authorization.require.bind(
      f.resources.authorization,
    );
    const fault = vi
      .spyOn(f.resources.authorization, 'require')
      .mockImplementation(async (...args) => {
        if (args[3] === 'manage')
          throw new Error('Synthetic authorization outage');
        return original(...args);
      });
    expect((await f.request('/settings?store=main')).status).toBe(503);
    fault.mockRestore();
    const settings = await f.settings.get(f.f.scope);
    await auditRaw(
      f.f.connection,
      'UPDATE "auditSettings" SET "settings" = ?',
      [
        JSON.stringify({
          ...settings,
          sources: {
            ...settings.sources,
            database: [
              {
                dataSource: 'private-store-sentinel',
                table: 'private-table-sentinel',
              },
            ],
          },
        }),
      ],
    );
    const denied = await f.request('/settings?store=main');
    expect(denied.status).toBe(403);
    expect(await denied.text()).not.toContain('private-store-sentinel');
    const health = await f.request('/health?store=main');
    expect(health.status).toBe(200);
    expect(await health.text()).not.toMatch(
      /private-store-sentinel|private-table-sentinel/,
    );
  });
  it('uses actual grants, immutable deployment requirements and filtered stores', async () => {
    const f = await createSettingsFixture(dialect, true);
    fixtures.push(f);
    await f.grant(f.alice.id, [], ['read']);
    const read = await f.request('/settings?store=main');
    expect(read.status).toBe(200);
    const response = (await read.json()) as AuditSettingsResponse;
    expect(response.meta).toEqual({
      canManage: false,
      complete: true,
      requirements: {
        auditRequired: true,
        mandatorySources: ['request'],
        requiredDataSources: [],
      },
      stores: ['main'],
    });
    expect(Object.isFrozen(f.settings.requirements)).toBe(true);
    expect(Object.isFrozen(f.settings.requirements.mandatorySources)).toBe(
      true,
    );
    await f.grant(f.alice.id, [], ['manage']);
    const manager = (await (
      await f.request('/settings?store=main')
    ).json()) as AuditSettingsResponse;
    expect(manager.meta?.canManage).toBe(true);
    expect((await f.request('/settings?store=main', f.bob.cookie)).status).toBe(
      403,
    );
    expect((await f.request('/health?store=other')).status).toBe(403);
    const health = (await (await f.request('/health?store=main')).json()) as {
      data: AuditHealthDto;
    };
    expect(health.data.declarationObservation).toBe('static');
    expect(health.data.declaredRoutes).toContainEqual({
      method: 'ALL',
      path: '/api/audit/*',
      action: 'audit.api.access',
    });
    expect(JSON.stringify(health)).not.toMatch(
      /connection|password|secret|handler|extractor/,
    );
    expect(
      health.data.captures?.every((entry) => entry.dataSource === 'main'),
    ).toBe(true);
  });
  it('returns independent degraded health after real settings table loss', async () => {
    const f = await createSettingsFixture(dialect);
    fixtures.push(f);
    await f.grant(f.alice.id, [], ['read', 'manage']);
    await auditRaw(f.f.connection, 'DROP TABLE "auditSettings"');
    const response = await f.request('/health?store=main');
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: AuditHealthDto };
    expect(body.data.state).toBe('degraded');
    expect(body.data.coverage.some((entry) => entry.lastError)).toBe(true);
    expect(body.data.declarationObservation).toBe('unknown');
  });
});

it('static inventory follows actual Hono mounts and only this collector, without requests', async () => {
  const f = await createSettingsFixture('sqlite');
  fixtures.push(f);
  const other = await createSettingsFixture('sqlite');
  fixtures.push(other);
  const first = f.http.collector.http({
    action: 'orders.read',
    titleKey: 'orders.readTitle',
    details: () => ({ secret: 'not-in-inventory' }),
  });
  const second = f.http.collector.http({ action: 'orders.second' });
  const child = new Hono();
  child.onError((_, context) => context.text('Synthetic route failure', 500));
  child.use('*', first);
  child.get('/orders', first, second, (context) => context.text('ok'));
  child.post('/orders', first, (context) => context.text('ok'));
  child.get(
    '/other',
    other.http.collector.http({ action: 'other.collector' }),
    (context) => context.text('ok'),
  );
  const parent = new Hono();
  parent.route('/v1', child);
  parent.route('/v2', child);
  const before = f.http.collector.describeRoutes(child.routes);
  const result = f.http.collector.describeRoutes(parent.routes);
  expect(before.some((entry) => entry.path === '/orders')).toBe(true);
  expect(result).toContainEqual({
    method: 'ALL',
    path: '/v1/*',
    action: 'orders.read',
    titleKey: 'orders.readTitle',
  });
  expect(result).toContainEqual({
    method: 'GET',
    path: '/v1/orders',
    action: 'orders.second',
  });
  expect(result).toContainEqual({
    method: 'POST',
    path: '/v2/orders',
    action: 'orders.read',
    titleKey: 'orders.readTitle',
  });
  expect(result.some((entry) => entry.action === 'other.collector')).toBe(
    false,
  );
  expect(Object.isFrozen(result)).toBe(true);
  expect(result.every(Object.isFrozen)).toBe(true);
  expect(
    f.http.collector.describeRoutes([...parent.routes, ...parent.routes]),
  ).toEqual(result);
  expect(JSON.stringify(result)).not.toMatch(/secret|details|handler/);
});
