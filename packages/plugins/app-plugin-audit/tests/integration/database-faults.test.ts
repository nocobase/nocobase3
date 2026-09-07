import { afterEach, expect, it, vi } from 'vitest';
import {
  createPortableFixture,
  type PortableFixture,
  dialects,
} from '../helpers/database-fixtures.js';
import { normalizeEvent } from '../../server/event-normalizer.js';
import type { AuditEventDto } from '../../server/contracts.js';

const fixtures: PortableFixture[] = [];
afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.cleanup()));
});

for (const dialect of dialects)
  it(
    'Store collector metadata persists and participates in idempotency ' +
      dialect,
    async () => {
      const f = await createPortableFixture(dialect);
      fixtures.push(f);
      const time = new Date().toISOString();
      const base = normalizeEvent(
        {
          action: 'synthetic.request',
          outcome: 'failed',
          details: { safe: true },
        },
        {
          scope: f.scope,
          kind: 'request',
          producer: 'audit.http',
          id: 'synthetic-http',
          occurredAt: time,
          recordedAt: time,
          store: 'main',
          policyVersion: 1,
        },
      ).event;
      const event: AuditEventDto = {
        ...base,
        http: {
          method: 'POST',
          routePattern: '/synthetic/:id',
          httpStatus: 409,
          durationMs: 0.25,
        },
        titleKey: 'synthetic.title',
        reasonCode: 'synthetic.conflict',
        captureWarnings: ['details.invalid'],
      };
      const first = await f.store.append(event, {
        idempotencyKey: 'synthetic-http-key',
      });
      expect(
        await f.store.append(
          {
            ...event,
            id: 'new-server-id',
            recordedAt: new Date().toISOString(),
          },
          { idempotencyKey: 'synthetic-http-key' },
        ),
      ).toEqual(first);
      expect(
        (await f.store.query(f.scope, { store: 'main' })).items[0],
      ).toEqual(event);
      for (const change of [
        { http: { ...event.http!, httpStatus: 410 } },
        { titleKey: 'another.title' },
        { reasonCode: 'another.reason' },
        { captureWarnings: ['another.warning'] },
      ])
        await expect(
          f.store.append(
            { ...event, ...change },
            { idempotencyKey: 'synthetic-http-key' },
          ),
        ).rejects.toMatchObject({ code: 'AUDIT_IDEMPOTENCY_CONFLICT' });
      // Metadata validation is JavaScript-only; persistence and fingerprints run on every dialect.
      if (dialect === 'sqlite') {
        const getter = vi.fn(() => 'secret-sentinel');
        const accessor = Object.defineProperty({}, 'method', {
          get: getter,
          enumerable: true,
        });
        const proxy = new Proxy({}, { get: getter, ownKeys: getter });
        for (const change of [
          { http: { ...event.http!, httpStatus: 99 } },
          { http: { ...event.http!, durationMs: Infinity } },
          { http: { ...event.http!, bindings: 'secret-sentinel' } },
          { http: accessor },
          { http: proxy },
          { titleKey: null },
          { reasonCode: 3 },
          { captureWarnings: [3] },
          { database: { executionId: 'e', countSemantics: 'matched' } },
          { unexpected: 'secret-sentinel' },
          { captureWarnings: new Proxy([], { get: getter }) },
        ])
          await expect(
            f.store.append({ ...event, ...change } as unknown as AuditEventDto),
          ).rejects.toMatchObject({ code: 'AUDIT_INVALID_EVENT' });
        await expect(
          f.store.append(
            Object.defineProperty({ ...event }, 'http', { get: getter }),
          ),
        ).rejects.toMatchObject({ code: 'AUDIT_INVALID_EVENT' });
        await expect(
          f.store.append(new Proxy(event, { get: getter })),
        ).rejects.toMatchObject({ code: 'AUDIT_INVALID_EVENT' });
        expect(getter).not.toHaveBeenCalled();
        await expect(
          f.store.appendWithLimits(event, {}, { maxBytes: 32 }),
        ).rejects.toMatchObject({ code: 'AUDIT_INVALID_EVENT' });
        await expect(
          f.recorder.record({
            action: 'synthetic.inject',
            outcome: 'success',
            http: event.http,
          } as unknown as Parameters<typeof f.recorder.record>[0]),
        ).rejects.toMatchObject({ code: 'AUDIT_INVALID_EVENT' });
      }
      expect(
        (await f.store.query(f.scope, { store: 'main' })).items,
      ).toHaveLength(1);
    },
  );

for (const dialect of dialects)
  it(
    'database metadata persists and binds execution/count fingerprint ' +
      dialect,
    async () => {
      const f = await createPortableFixture(dialect);
      fixtures.push(f);
      const time = new Date().toISOString();
      const event: AuditEventDto = {
        ...normalizeEvent(
          { action: 'database.update', outcome: 'success' },
          {
            scope: f.scope,
            kind: 'database',
            producer: 'audit.database',
            id: 'synthetic-count',
            occurredAt: time,
            recordedAt: time,
            store: 'main',
            policyVersion: 1,
          },
        ).event,
        database: {
          executionId: 'execution-one',
          count: 0,
          countSemantics: 'matched',
        },
      };
      const receipt = await f.store.append(event, {
        idempotencyKey: 'count-key',
      });
      expect(await f.store.findById(f.scope, receipt.eventId)).toEqual(event);
      for (const change of [
        { count: 1 },
        { countSemantics: 'changed' },
        { executionId: 'execution-two' },
      ])
        await expect(
          f.store.append(
            {
              ...event,
              database: { ...event.database!, ...change },
            } as AuditEventDto,
            { idempotencyKey: 'count-key' },
          ),
        ).rejects.toMatchObject({ code: 'AUDIT_IDEMPOTENCY_CONFLICT' });
      if (dialect === 'sqlite') {
        for (const change of [
          { count: -1 },
          { count: 0.5 },
          { count: NaN },
          { count: '1' },
          { countSemantics: 'invented' },
          { executionId: '' },
          { before: { secret: 'sentinel' } },
        ])
          await expect(
            f.store.append({
              ...event,
              database: { ...event.database!, ...change },
            } as unknown as AuditEventDto),
          ).rejects.toMatchObject({ code: 'AUDIT_INVALID_EVENT' });
        const getter = vi.fn(() => 'secret-sentinel');
        await expect(
          f.store.append({
            ...event,
            database: Object.defineProperty({}, 'executionId', {
              get: getter,
            }) as AuditEventDto['database'],
          }),
        ).rejects.toMatchObject({ code: 'AUDIT_INVALID_EVENT' });
        expect(getter).not.toHaveBeenCalled();
      }
      expect(
        (await f.store.query(f.scope, { store: 'main' })).items,
      ).toHaveLength(1);
    },
  );
