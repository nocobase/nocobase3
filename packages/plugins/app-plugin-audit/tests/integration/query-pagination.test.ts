import { afterEach, describe, expect, it } from 'vitest';
import { createQueryFixture } from '../helpers/query-fixture.js';
import { dialects, auditRows, auditRaw } from '../helpers/database-fixtures.js';
import { createHash } from 'node:crypto';
import { PortableAuditStore } from '../../server/store.js';
import { ScopedAuditQueryService } from '../../server/query-service.js';
import {
  AuditAuthorization,
  type AuditResourceAdapter,
} from '../../server/authorization.js';
import type { AuditEventsPage } from '../../server/contracts.js';

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanups.splice(0).reverse()) await close();
});
for (const dialect of dialects)
  describe('pagination ' + dialect, () => {
    it('treats rewritten positions as untrusted input and reauthorizes HTTP continuation', async () => {
      const s = await createQueryFixture(dialect);
      cleanups.push(s.cleanup);
      await s.grant(s.alice.id, ['read']);
      for (const id of ['a', 'b', 'c']) await s.append(id);
      await s.append('foreign-owner', {
        dataSource: 'main',
        resource: 'documents',
        key: 'b',
      });
      await s.append('foreign-scope', undefined, {
        ...s.f.scope,
        securityScope: 'other',
      });
      const url =
        '/events?store=main&action=synthetic.read&target=' + s.target('a');
      const first = (
        (await (await s.request(url + '&pageSize=1')).json()) as {
          data: AuditEventsPage;
        }
      ).data;
      const tuple = JSON.parse(
        Buffer.from(first.nextCursor!, 'base64url').toString(),
      ) as unknown[];
      tuple[2] = '2027-01-01T00:00:00.000Z';
      tuple[3] = 'arbitrary-position';
      const rewritten = Buffer.from(JSON.stringify(tuple)).toString(
        'base64url',
      );
      const response = await s.request(url + '&cursor=' + rewritten);
      expect(response.status).toBe(200);
      const page = ((await response.json()) as { data: AuditEventsPage }).data;
      expect(page.items.map((item) => item.id)).toEqual(['c', 'b', 'a']);
      await auditRaw(
        s.f.connection,
        'UPDATE "g11_documents" SET "owner_id" = ? WHERE "id" = ?',
        [s.bob.id, 'a'],
      );
      expect(
        (await s.request(url + '&cursor=' + first.nextCursor)).status,
      ).toBe(403);
    });
    it('resumes after denied candidates at a batch boundary and rechecks live authorization', async () => {
      const s = await createQueryFixture(dialect);
      cleanups.push(s.cleanup);
      await s.grant(s.alice.id, ['read']);
      for (let i = 0; i < 105; i++) await s.append(String(i).padStart(3, '0'));
      let calls = 0;
      let intermittent = false;
      const adapter: AuditResourceAdapter = {
        dataSource: 'main',
        resource: 'documents',
        canRead: () =>
          Promise.resolve(
            !intermittent || ++calls === 1 || calls === 101
              ? 'allowed'
              : 'denied',
          ),
      };
      let adapters = [adapter];
      const authorization = new AuditAuthorization({
        boundary: s.f.scope,
        stores: ['main'],
        adapters: () => adapters,
      });
      const query = new ScopedAuditQueryService(authorization, [s.f.store]);
      const authz = () =>
        s.appAuthorization.for({ principal: { type: 'user', id: s.alice.id } });
      const target = { dataSource: 'main', resource: 'documents', key: 'a' };
      const input = {
        store: 'main',
        action: 'synthetic.read',
        target,
        pageSize: 1,
      };
      const proof = await authorization.issue(authz(), 'main', target);
      intermittent = true;
      const first = await query.list(proof, input);
      expect(first.items.map((item) => item.id)).toEqual(['104']);
      expect(calls).toBe(101);
      intermittent = false;
      const fresh = await authorization.issue(authz(), 'main', target);
      const second = await query.list(fresh, {
        ...input,
        pageSize: 100,
        cursor: first.nextCursor,
      });
      expect(second.items.map((item) => item.id)).toEqual([
        '004',
        '003',
        '002',
        '001',
        '000',
      ]);
      expect(second.nextCursor).toBeUndefined();
      expect(await query.count(fresh, input)).toBe(105);
      adapters = [];
      expect(
        (await query.list(fresh, { ...input, cursor: first.nextCursor })).items,
      ).toEqual([]);
      await expect(
        authorization.issue(authz(), 'main', target),
      ).rejects.toThrow('Audit access denied.');
    });
    it('continues cursors across replacement stores and authorization services', async () => {
      const s = await createQueryFixture(dialect);
      cleanups.push(s.cleanup);
      await s.grant(s.alice.id, ['read', 'readAll']);
      for (const id of ['a', 'b', 'c']) await s.append(id);
      const input = { store: 'main', action: 'synthetic.read', pageSize: 1 };
      const authz = () =>
        s.appAuthorization.for({ principal: { type: 'user', id: s.alice.id } });
      const proof = await s.resources.authorization.issue(authz(), 'main');
      const first = await s.resources.query.list(proof, input);
      const replacement = new PortableAuditStore(
        s.f.connection,
        s.f.store.binding,
      );
      await replacement.prepare();
      const raw = await s.f.store.query(proof.scope, input);
      await expect
        .soft(
          replacement.query(proof.scope, { ...input, cursor: raw.nextCursor }),
        )
        .resolves.toMatchObject({ items: [{ id: 'b' }] });
      const authorization = new AuditAuthorization({
        boundary: s.f.scope,
        stores: ['main'],
        adapters: [],
      });
      const query = new ScopedAuditQueryService(authorization, [replacement]);
      const nextProof = await authorization.issue(authz(), 'main');
      await expect(
        query.list(nextProof, { ...input, cursor: first.nextCursor }),
      ).resolves.toMatchObject({ items: [{ id: 'b' }] });
    });
    it.each([20, 100])(
      'batches a readable page of %i with at most two candidate SQL queries',
      async (pageSize) => {
        const s = await createQueryFixture(dialect);
        cleanups.push(s.cleanup);
        await s.grant(s.alice.id, ['read', 'readAll']);
        for (let i = 0; i < 105; i++)
          await s.append(String(i).padStart(3, '0'));
        const proof = await s.resources.authorization.issue(
          s.appAuthorization.for({
            principal: { type: 'user', id: s.alice.id },
          }),
          'main',
        );
        const client = await s.f.connection.client<{
          on(event: 'query', listener: (query: { sql: string }) => void): void;
          removeListener(
            event: 'query',
            listener: (query: { sql: string }) => void,
          ): void;
        }>();
        const queries: string[] = [];
        const listener = (query: { sql: string }): void => {
          if (query.sql.includes('auditEvents')) queries.push(query.sql);
        };
        client.on('query', listener);
        try {
          const page = await s.resources.query.list(proof, {
            store: 'main',
            action: 'synthetic.read',
            pageSize,
          });
          expect(page.items).toHaveLength(pageSize);
          expect(page.nextCursor).toBeTruthy();
          expect(queries).toHaveLength(pageSize === 20 ? 1 : 2);
        } finally {
          client.removeListener('query', listener);
        }
      },
    );
    it('locates old exact IDs beyond 10000 newer rows with one SQL query and all target predicates', async () => {
      const s = await createQueryFixture(dialect);
      cleanups.push(s.cleanup);
      await s.grant(s.alice.id, ['read', 'readAll']);
      await s.append('old');
      const [base] = await auditRows(
        s.f.connection,
        'SELECT * FROM "auditEvents" WHERE "id" = ?',
        ['old'],
      );
      const columns = Object.keys(base);
      for (let offset = 0; offset < 10001; offset += 20) {
        const rows = Array.from(
          { length: Math.min(20, 10001 - offset) },
          (_, index) => {
            const id = 'newer-' + (offset + index);
            const payload = JSON.parse(String(base.payload)) as Record<
              string,
              unknown
            >;
            return {
              ...base,
              id,
              eventHash: createHash('sha256').update(id).digest('hex'),
              occurredAt: '2026-09-06T00:00:00.000Z',
              payload: JSON.stringify({
                ...payload,
                id,
                occurredAt: '2026-09-06T00:00:00.000Z',
              }),
            };
          },
        );
        await auditRaw(
          s.f.connection,
          'INSERT INTO "auditEvents" (' +
            columns.map((column) => '"' + column + '"').join(',') +
            ') VALUES ' +
            rows
              .map(() => '(' + columns.map(() => '?').join(',') + ')')
              .join(','),
          rows.flatMap((row) =>
            columns.map((column) => Reflect.get(row, column)),
          ),
        );
      }
      const client = await s.f.connection.client<{
        on(event: 'query', listener: (query: { sql: string }) => void): void;
        removeListener(
          event: 'query',
          listener: (query: { sql: string }) => void,
        ): void;
      }>();
      const queries: string[] = [];
      const listener = (query: { sql: string }): void => {
        if (query.sql.includes('auditEvents')) queries.push(query.sql);
      };
      client.on('query', listener);
      try {
        const proof = await s.resources.authorization.issue(
          s.appAuthorization.for({
            principal: { type: 'user', id: s.alice.id },
          }),
          'main',
          { dataSource: 'main', resource: 'documents', key: 'a' },
        );
        expect(
          (await s.resources.query.detail(proof, { store: 'main', id: 'old' }))
            ?.id,
        ).toBe('old');
        expect(queries).toHaveLength(1);
        for (const column of [
          'eventHash',
          'scopeIndex',
          'appId',
          'securityScope',
          'store',
          'targetResource',
          'targetDataSource',
          'targetKeyHash',
          'targetKeyEncoding',
        ])
          expect(queries[0]).toContain(column);
        expect(
          await s.f.store.queryEvent(
            s.f.scope,
            { store: 'main', id: 'old' },
            { dataSource: 'main', resource: 'documents', key: 'b' },
          ),
        ).toBeUndefined();
        expect(
          await s.f.store.queryEvent(s.f.scope, {
            store: 'main',
            id: 'missing',
          }),
        ).toBeUndefined();
        expect(queries).toHaveLength(3);
      } finally {
        client.removeListener('query', listener);
      }
      for (const id of ['A', 'a', 'a ', 'a  '])
        await s.append(id, {
          dataSource: 'main',
          resource: 'compound',
          key: { tenant: 1, key: 'same' },
        });
      for (const id of ['A', 'a', 'a ', 'a  ']) {
        expect(
          (
            await s.f.store.queryEvent(
              s.f.scope,
              { store: 'main', id },
              {
                dataSource: 'main',
                resource: 'compound',
                key: { key: 'same', tenant: 1 },
              },
            )
          )?.id,
        ).toBe(id);
        expect(
          await s.f.store.queryEvent(
            s.f.scope,
            { store: 'main', id },
            {
              dataSource: 'main',
              resource: 'compound',
              key: { key: 'same', tenant: '1' },
            },
          ),
        ).toBeUndefined();
      }
      await expect(
        s.f.store.queryEvent(
          { ...s.f.scope, securityScope: 'foreign' },
          { store: 'main', id: 'old' },
        ),
      ).rejects.toMatchObject({ code: 'AUDIT_TRANSACTION_MISMATCH' });
      await expect(
        s.f.store.queryEvent(s.f.scope, { store: 'foreign', id: 'old' }),
      ).rejects.toMatchObject({ code: 'AUDIT_TRANSACTION_MISMATCH' });
    }, 60000);
    it('binds cursors to principal, filters, resource, app/scope and store; stable equal-time ordering', async () => {
      const s = await createQueryFixture(dialect);
      cleanups.push(s.cleanup);
      await s.grant(s.alice.id, ['read', 'readAll']);
      await s.grant(s.bob.id, ['read', 'readAll']);
      const ids = ['A', 'a', 'a ', 'a  ', 'z', 'Z'];
      for (const id of ids) await s.append(id);
      const url = '/events?store=main&action=synthetic.read&pageSize=2';
      let cursor: string | undefined;
      const seen: string[] = [];
      do {
        const response = await s.request(
          url + (cursor ? '&cursor=' + cursor : ''),
        );
        expect(response.status).toBe(200);
        const page = ((await response.json()) as { data: AuditEventsPage })
          .data;
        seen.push(...page.items.map((item) => item.id));
        cursor = page.nextCursor;
      } while (cursor);
      expect(seen.sort()).toEqual(ids.sort());
      const first = (
        (await (await s.request(url)).json()) as { data: AuditEventsPage }
      ).data;
      expect(first.nextCursor).toBeTruthy();
      const token = first.nextCursor!;
      const tuple = JSON.parse(
        Buffer.from(token, 'base64url').toString(),
      ) as unknown[];
      const invalidUtf8 = Buffer.from(
        JSON.stringify([1, tuple[1], tuple[2], 'x']),
      );
      invalidUtf8[invalidUtf8.length - 3] = 255;
      expect(
        (await s.request(url + '&cursor=' + invalidUtf8.toString('base64url')))
          .status,
      ).toBe(400);
      const malformed: unknown[] = [
        [2, ...tuple.slice(1)],
        [1, tuple[1], '2026-02-30T00:00:00.000Z', tuple[3]],
        [1, tuple[1], tuple[2], ''],
        [1, tuple[1], tuple[2], 'x'.repeat(513)],
        [1, tuple[1], tuple[2], 42],
        [...tuple, 'extra'],
        { version: 1 },
      ];
      for (const value of malformed) {
        const invalidToken = Buffer.from(JSON.stringify(value)).toString(
          'base64url',
        );
        expect((await s.request(url + '&cursor=' + invalidToken)).status).toBe(
          400,
        );
      }
      for (const invalidToken of [
        token + '=',
        'x'.repeat(8193),
        token + '.signature',
      ])
        expect(
          (await s.request(url + '&cursor=' + encodeURIComponent(invalidToken)))
            .status,
        ).toBe(400);
      expect(
        (await s.request(url + '&cursor=' + token, s.bob.cookie)).status,
      ).toBe(400);
      expect(
        (await s.request(url + '&cursor=' + token.slice(0, -8) + 'tampered'))
          .status,
      ).toBe(400);
      expect(
        (
          await s.request(
            url.replace('synthetic.read', 'another') + '&cursor=' + token,
          )
        ).status,
      ).toBe(400);
      expect(
        (await s.request(url + '&target=' + s.target('b') + '&cursor=' + token))
          .status,
      ).toBe(400);
      expect(
        (
          await s.request(
            url.replace('store=main', 'store=foreign') + '&cursor=' + token,
          )
        ).status,
      ).toBe(403);
      for (const extra of [
        '&sort=sql',
        '&pageSize=0',
        '&from=not-date',
        '&from=2026-02-30T00:00:00.000Z',
        '&kind=invalid',
        '&connection=foreign',
        '&resourceId=b',
      ])
        expect((await s.request('/events?store=main' + extra)).status).toBe(
          400,
        );
    });
  });
