import { afterEach, describe, expect, it } from 'vitest';
import { createAuditApiFixture } from '../helpers/api-fixture.js';
import {
  dialects,
  auditRaw,
  auditRows,
  createPortableFixture,
} from '../helpers/database-fixtures.js';
import {
  AuditAuthorization,
  AuditAccessDenied,
} from '../../server/authorization.js';
import type { AuditEventsPage } from '../../server/contracts.js';
import { ScopedAuditQueryService } from '../../server/query-service.js';
import { createAuditQueryResources } from '../../server/providers/routes.js';

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanups.splice(0).reverse()) await close();
});
for (const dialect of dialects)
  describe('real authentication and SQL ACL ' + dialect, () => {
    async function fixture() {
      const s = await createAuditApiFixture(dialect);
      cleanups.push(s.cleanup);
      return s;
    }
    it('authenticates real sessions and requires persisted permission grants', async () => {
      const s = await fixture();
      expect((await s.request('/events?store=main', '')).status).toBe(401);
      expect((await s.request('/events?store=main')).status).toBe(403);
      await s.grant(s.alice.id, ['read', 'readAll']);
      expect((await s.request('/events?store=main')).status).toBe(200);
      expect((await s.request('/events?store=main', s.bob.cookie)).status).toBe(
        403,
      );
    });
    it('rejects another owner and applies the target to list/detail/operation/count in SQL', async () => {
      const s = await fixture();
      await s.grant(s.alice.id, ['read']);
      await s.append('a');
      await s.append('b', {
        dataSource: 'main',
        resource: 'documents',
        key: 'b',
      });
      await s.append('foreign-app', undefined, {
        ...s.f.scope,
        appId: 'other-app',
      });
      await s.append('foreign-tenant', undefined, {
        ...s.f.scope,
        securityScope: 'other-tenant',
      });
      await s.resources.authorization.issue(
        s.appAuthorization.for({ principal: { type: 'user', id: s.alice.id } }),
        'main',
        { dataSource: 'main', resource: 'documents', key: 'a' },
      );
      const filter = '&target=' + s.target('a');
      const list = await s.request('/events?store=main&count=true' + filter);
      expect(list.status).toBe(200);
      const body = (await list.json()) as {
        data: AuditEventsPage;
        total: number;
      };
      expect(body.total).toBe(1);
      expect(body.data.items.map((item) => item.id)).toEqual(['a']);
      expect(JSON.stringify(body)).not.toContain('metadata-sentinel');
      expect(JSON.stringify(body)).not.toContain('private-label');
      expect((await s.request('/events/b?store=main' + filter)).status).toBe(
        404,
      );
      const operation = (await (
        await s.request('/operations/same-operation?store=main' + filter)
      ).json()) as { data: AuditEventsPage };
      expect(operation.data.items.map((item) => item.id)).toEqual(['a']);
      for (const path of [
        '/events?count=true',
        '/events/b?',
        '/operations/same-operation?',
      ]) {
        const separator = path.endsWith('?') ? '' : '&';
        expect(
          (
            await s.request(
              path + separator + 'store=main&target=' + s.target('b'),
            )
          ).status,
        ).toBe(403);
      }
      expect((await s.request('/events?store=other' + filter)).status).toBe(
        403,
      );
      expect(
        (await s.request('/events?store=main&appId=other-app' + filter)).status,
      ).toBe(400);
      expect(
        (
          await s.request(
            '/events?store=main&securityScope=other-tenant' + filter,
          )
        ).status,
      ).toBe(400);
    });
    it('denies unknown adapters and deleted resources without dedicated permissions', async () => {
      const s = await fixture();
      await s.grant(s.alice.id, ['read']);
      await s.append('a');
      const unknown = encodeURIComponent(
        JSON.stringify({ dataSource: 'main', resource: 'unknown', key: 'a' }),
      );
      expect(
        (await s.request('/events?store=main&target=' + unknown)).status,
      ).toBe(403);
      await auditRaw(
        s.f.connection,
        'DELETE FROM "audit_documents" WHERE "id" = ?',
        ['a'],
      );
      expect(
        (await s.request('/events?store=main&target=' + s.target('a'))).status,
      ).toBe(403);
      await s.grant(s.alice.id, ['readDeleted']);
      const response = await s.request(
        '/events?store=main&target=' + s.target('a'),
      );
      expect(response.status).toBe(200);
      expect(
        ((await response.json()) as { data: AuditEventsPage }).data.items.map(
          (event) => event.id,
        ),
      ).toEqual(['a']);
      expect(
        await auditRows(
          s.f.connection,
          'SELECT "id" FROM "auditEvents" WHERE "id" = ?',
          ['a'],
        ),
      ).toHaveLength(1);
      expect(
        (await s.request('/events?store=main&target=' + unknown)).status,
      ).toBe(403);
    });
    it('metadata and global access are independent server permissions; forged evidence fails closed', async () => {
      const s = await fixture();
      await s.grant(s.alice.id, ['read']);
      await s.append('a');
      expect((await s.request('/events?store=main')).status).toBe(403);
      await s.grant(s.alice.id, ['readMetadata']);
      const response = await s.request(
        '/events/a?store=main&target=' + s.target('a'),
      );
      expect(await response.text()).toContain('metadata-sentinel');
      const authz = s.appAuthorization.for({
        principal: { type: 'user', id: s.alice.id },
      });
      const proof = await s.resources.authorization.issue(authz, 'main', {
        dataSource: 'main',
        resource: 'documents',
        key: 'a',
      });
      await expect(
        s.resources.query.list(
          { ...proof, stores: ['other'], canRead: () => Promise.resolve(true) },
          { store: 'other' },
        ),
      ).rejects.toBeInstanceOf(AuditAccessDenied);
      await expect(
        s.resources.query.list(proof, {
          store: 'main',
          target: { dataSource: 'main', resource: 'documents', key: 'b' },
        }),
      ).rejects.toBeInstanceOf(AuditAccessDenied);
      const other = new AuditAuthorization({
        boundary: { ...s.f.scope, appId: 'other' },
        stores: ['main'],
        adapters: [],
      });
      expect(() => other.verify(proof)).toThrow(AuditAccessDenied);
    });
    it('settings CAS uses trusted identity and exact configuration store; errors stay safe', async () => {
      const s = await fixture();
      expect((await s.request('/settings?store=main')).status).toBe(403);
      await s.grant(s.alice.id, [], ['read', 'manage']);
      const initial = await s.request('/settings?store=main');
      expect(initial.status).toBe(200);
      expect(initial.headers.get('etag')).toBe('"1"');
      const body = (await initial.json()) as {
        data: Awaited<ReturnType<typeof s.settings.get>>;
      };
      const { revision: _revision, ...settings } = body.data;
      const update = {
        expectedRevision: 1,
        settings: { ...settings, retentionDays: null },
        confirmRetentionReduction: false,
      };
      const put = (value: unknown, match: string = '"1"') =>
        s.request('/settings?store=main', s.alice.cookie, {
          method: 'PUT',
          headers: { 'content-type': 'application/json', 'if-match': match },
          body: JSON.stringify(value),
        });
      expect(
        (await put({ ...update, settings: { ...settings, retentionDays: 1 } }))
          .status,
      ).toBe(409);
      expect((await s.settings.get(s.f.scope)).revision).toBe(1);
      expect(
        (await put({ ...update, appId: 'forged', actor: { type: 'system' } }))
          .status,
      ).toBe(409);
      expect((await put(update, '"9"')).status).toBe(409);
      const results = await Promise.all([put(update), put(update)]);
      expect(results.map((response) => response.status).sort()).toEqual([
        200, 409,
      ]);
      expect((await s.settings.get(s.f.scope)).revision).toBe(2);
      const rows = await auditRows(
        s.f.connection,
        'SELECT "payload" FROM "auditEvents" WHERE "action" = ?',
        ['audit.settings.update'],
      );
      expect(rows).toHaveLength(1);
      expect(JSON.stringify(rows)).toContain(s.alice.id);
      expect((await s.request('/health?store=main')).status).toBe(200);
      expect((await s.request('/health?store=foreign')).status).toBe(403);
    });
    it('exposes no generic audit event mutation and records safe API observations', async () => {
      const s = await fixture();
      await s.grant(s.alice.id, ['read', 'readAll']);
      await s.append('a');
      for (const method of ['POST', 'PATCH', 'DELETE'])
        expect(
          (await s.request('/events/a?store=main', s.alice.cookie, { method }))
            .status,
        ).toBe(404);
      expect((await s.request('/events?store=main')).status).toBe(200);
      const rows = await auditRows(
        s.f.connection,
        'SELECT "payload" FROM "auditEvents" WHERE "action" = ?',
        ['audit.api.access'],
      );
      expect(rows.length).toBeGreaterThan(0);
      expect(JSON.stringify(rows)).not.toContain(s.alice.cookie);
      expect(JSON.stringify(rows)).toContain(s.alice.id);
    });
    it('isolates real physical stores and rejects forged boundaries and resource keys', async () => {
      const s = await fixture();
      const other = await createPortableFixture(dialect, true, 'archive');
      cleanups.push(other.cleanup);
      await other.recorder.record({
        action: 'foreign-store-sentinel',
        outcome: 'success',
      });
      await s.grant(s.alice.id, ['read', 'readAll']);
      const engine = new AuditAuthorization({
        boundary: s.f.scope,
        stores: ['main', 'archive'],
        adapters: [],
      });
      const queries = new ScopedAuditQueryService(engine, [
        s.f.store,
        other.store,
      ]);
      const proof = await engine.issue(
        s.appAuthorization.for({ principal: { type: 'user', id: s.alice.id } }),
        'main',
      );
      await expect(
        queries.list(proof, { store: 'archive' }),
      ).rejects.toBeInstanceOf(AuditAccessDenied);
      await expect(
        queries.list(
          { ...proof, scope: { ...proof.scope, securityScope: 'forged' } },
          { store: 'main' },
        ),
      ).rejects.toBeInstanceOf(AuditAccessDenied);
      const current = await queries.list(proof, { store: 'main' });
      expect(JSON.stringify(current)).not.toContain('foreign-store-sentinel');
      await s.append('composite', {
        dataSource: 'main',
        resource: 'composite',
        key: { id: '1', tenant: 1 },
      });
      const page = await queries.list(proof, {
        store: 'main',
        target: {
          dataSource: 'main',
          resource: 'composite',
          key: { tenant: 1, id: '1' },
        },
      });
      expect(page.items.map((event) => event.id)).toEqual(['composite']);
      expect(
        (
          await queries.list(proof, {
            store: 'main',
            target: {
              dataSource: 'main',
              resource: 'composite',
              key: { id: '1', tenant: '1' },
            },
          })
        ).items,
      ).toHaveLength(0);
      expect(
        (
          await queries.list(proof, {
            store: 'main',
            target: {
              dataSource: 'main',
              resource: 'composite',
              key: "' OR 1=1 --",
            },
          })
        ).items,
      ).toHaveLength(0);
      expect(() =>
        createAuditQueryResources({
          boundary: s.f.scope,
          stores: ['main'],
          adapters: [],
          eventStores: [s.f.store],
          configurationStore: other.store,
          settings: s.settings,
          appAuthorization: s.appAuthorization,
        }),
      ).toThrow('AUDIT_TRANSACTION_MISMATCH');
    });
  });
