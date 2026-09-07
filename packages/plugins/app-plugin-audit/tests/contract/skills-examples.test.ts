import { describe, expect, it } from 'vitest';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import {
  auditPermissionId,
  auditServiceToken,
} from '@nocobase/app-plugin-audit/server';
import type {
  AuditEventsPage,
  AuditSettingsResponse,
} from '@nocobase/app-plugin-audit/client/contracts';
import { recordValidation } from '../../skills/nocobase-app-plugin-audit/examples/runtime.js';
import { selectExampleTable } from '../../skills/nocobase-app-plugin-audit/examples/table-policy.js';
import { dialects } from '../helpers/database-fixtures.js';
import { createSkillsApp } from './skills-app.js';
const json = (body: object, cookie?: string): RequestInit => ({
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    origin: 'http://localhost',
    ...(cookie ? { cookie } : {}),
  },
  body: JSON.stringify(body),
});

describe.each(dialects)('published Skill examples %s', (dialect) => {
  it('runs the actual HTTP, runtime and Settings examples with real events and authorization', async () => {
    const s = await createSkillsApp(dialect);
    try {
      const request = (path: string, init?: RequestInit) =>
        Promise.resolve(
          s.app.fetch(new Request('http://localhost/api/' + path, init)),
        );
      expect((await request('audit-example/status')).status).toBe(401);
      const signup = await request(
        'auth/sign-up/email',
        json({
          name: 'User',
          email: 'g21@example.test',
          password: 'synthetic long password',
        }),
      );
      expect(signup.status).toBe(200);
      const user = (await signup.json()) as { user: { id: string } };
      const cookie = signup.headers.get('set-cookie') ?? '';
      expect(
        (await request('audit/events?store=main', { headers: { cookie } }))
          .status,
      ).toBe(403);
      const authz = s.app.container.resolve(authorizationToken);
      await authz.permissionSets.create({
        key: 'g21-auditor',
        grants: [
          {
            resource: {
              type: 'audit.events',
              id: auditPermissionId({ appId: 'main' }, 'main'),
            },
            actions: ['read', 'readAll', 'readMetadata'].map((action) => ({
              action,
            })),
          },
          {
            resource: {
              type: 'audit.settings',
              id: auditPermissionId({ appId: 'main' }, 'main'),
            },
            actions: ['read', 'manage'].map((action) => ({ action })),
          },
        ],
      });
      await authz.permissionSets.assign({
        subject: { type: 'user', id: user.user.id },
        permissionSet: 'g21-auditor',
      });
      const client = {
        request: async <T>(path: string, init?: RequestInit): Promise<T> => {
          const headers = new Headers(init?.headers);
          headers.set('cookie', cookie);
          headers.set('origin', 'http://localhost');
          const response = await request(path, { ...init, headers });
          if (!response.ok)
            throw new Error(
              'HTTP ' + response.status + ': ' + (await response.text()),
            );
          return (await response.json()) as T;
        },
      };
      const http = await client.request<{ available: boolean }>(
        'audit-example/status',
      );
      expect(http).toEqual({ available: true });
      const httpEvents = await client.request<{ data: AuditEventsPage }>(
        'audit/events?store=main&action=audit-example.status',
      );
      expect(httpEvents.data.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: 'request',
            outcome: 'success',
            actor: { type: 'user', id: user.user.id },
          }),
          expect.objectContaining({
            kind: 'request',
            outcome: 'denied',
            actor: { type: 'anonymous' },
          }),
        ]),
      );
      // This fixture is the trusted host: identity comes from the real signup response,
      // never from a request body or from an event supplied to domain code.
      const service = s.app.container.resolve(auditServiceToken);
      const recorder = service.bind(
        {
          appId: s.app.appName,
          actor: { type: 'user', id: user.user.id },
          initiator: { type: 'user', id: user.user.id },
        },
        { producer: 'audit-example-runtime' },
      );
      const receipt = await recordValidation(recorder);
      expect(receipt.state).toBe('committed');
      const business = await client.request<{ data: AuditEventsPage }>(
        'audit/events?store=main&action=audit-example.validation-completed',
      );
      expect(business.data.items).toHaveLength(1);
      expect(business.data.items[0]).toMatchObject({
        kind: 'business',
        outcome: 'success',
        actor: { id: user.user.id },
        initiator: { id: user.user.id },
      });
      await s.f.connection.query
        .insertInto('audit_example_items')
        .values({ id: 'before', name: 'G21-value-sentinel' })
        .execute();
      expect(
        (
          await client.request<{ data: AuditEventsPage }>(
            'audit/events?store=main&kind=database',
          )
        ).data.items,
      ).toHaveLength(0);
      const saved = await selectExampleTable(client);
      expect(saved.data.sources.database).toContainEqual({
        dataSource: 'main',
        table: 'audit_example_items',
      });
      await client.request('g21/insert', { method: 'POST' });
      const database = await client.request<{ data: AuditEventsPage }>(
        'audit/events?store=main&kind=database',
      );
      expect(database.data.items).toHaveLength(1);
      expect(database.data.items[0]).toMatchObject({
        kind: 'database',
        action: 'database.insert',
        actor: { type: 'user', id: user.user.id },
        initiator: { type: 'user', id: user.user.id },
        target: { resource: 'audit_example_items' },
      });
      expect(JSON.stringify(database)).not.toContain('G21-value-sentinel');
      const raw = await s.f.connection.client<{
        raw(sql: string): Promise<unknown>;
      }>();
      await raw.raw(
        "INSERT INTO audit_example_items (id, name) VALUES ('raw', 'G21-raw-sentinel')",
      );
      expect(
        (
          await client.request<{ data: AuditEventsPage }>(
            'audit/events?store=main&kind=database',
          )
        ).data.items,
      ).toHaveLength(1);
      await expect(
        service
          .bind(
            { appId: 'foreign-app', actor: { type: 'unknown' } },
            { producer: 'audit-example-runtime' },
          )
          .record({ action: 'g21.foreign', outcome: 'success' }),
      ).rejects.toMatchObject({ code: 'AUDIT_TRANSACTION_MISMATCH' });
      await expect(
        recorder.record({ action: '', outcome: 'success' }),
      ).rejects.toMatchObject({ code: 'AUDIT_INVALID_EVENT' });

      const { revision, ...settings } = saved.data;
      await client.request('audit/settings?store=main', {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          'if-match': '"' + revision + '"',
        },
        body: JSON.stringify({
          expectedRevision: revision,
          settings: { ...settings, enabled: false },
          confirmRetentionReduction: false,
        }),
      });
      expect(await recordValidation(recorder)).toMatchObject({
        state: 'disabled',
      });
      expect(
        (
          await client.request<AuditSettingsResponse>(
            'audit/settings?store=main',
          )
        ).data.enabled,
      ).toBe(false);
    } finally {
      await s.close();
    }
  });
});
