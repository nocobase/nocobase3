import { ServiceContainer } from '@nocobase/service-provider';
import { describe, expect, expectTypeOf, it } from 'vitest';
import plugin, {
  auditServiceToken,
  DisabledAuditRecorder,
} from '@nocobase/app-plugin-audit/server';
import { auditServiceToken as tokenFromSubpath } from '@nocobase/app-plugin-audit/server/tokens';
import type {
  AuditEventInput,
  AuditReceipt,
  AuditRecorder,
  AuditService,
  AuditEventDto,
  AuditEventsQuery,
  AuditSettingsUpdate,
} from '@nocobase/app-plugin-audit/server/contracts';
import type { AuditEventsPage } from '@nocobase/app-plugin-audit/client/contracts';

const input: AuditEventInput = {
  action: 'orders.approve',
  outcome: 'denied',
  target: {
    dataSource: 'business',
    resource: 'orders',
    key: { tenant: 'test', id: 42 },
  },
};
const event: AuditEventDto = {
  id: 'fixture-event',
  eventVersion: 1,
  kind: 'business',
  producer: 'fixture',
  action: input.action,
  outcome: input.outcome,
  appId: 'fixture-app',
  securityScope: 'fixture-scope',
  actor: { type: 'workflow', id: 'fixture-run' },
  initiator: { type: 'user', id: 'fixture-user' },
  occurredAt: '2026-09-05T00:00:00Z',
  recordedAt: '2026-09-05T00:00:00Z',
  store: 'observations',
  target: input.target,
  policyVersion: 1,
};

describe('public audit bootstrap', () => {
  it('returns an explicit disabled receipt without executing payload accessors', async () => {
    const recorder: AuditRecorder = new DisabledAuditRecorder(
      'deployment-disabled',
    );
    const details = Object.defineProperty({}, 'secret', {
      get() {
        throw new Error('Payload must not be captured while disabled');
      },
    });
    expect(await recorder.record({ ...input, details })).toEqual({
      state: 'disabled',
      reason: 'deployment-disabled',
    });
    expect(await recorder.record(input)).not.toHaveProperty('eventId');
  });
  it('requires an explicit reason', () => {
    expect(() => new DisabledAuditRecorder(' ')).toThrow(
      'explicit disabled reason',
    );
  });
  it('shares the original token across public entry points and container bindings', () => {
    expect(auditServiceToken).toBe(tokenFromSubpath);
    const container = new ServiceContainer();
    expect(container.resolveIfCreated(tokenFromSubpath)).toBeUndefined();
    const service: AuditService = {
      bind: () => new DisabledAuditRecorder('fixture-disabled'),
      http: () => {
        throw new Error('HTTP collector not implemented');
      },
      markHttpResult: () => {
        throw new Error('HTTP collector not implemented');
      },
    };
    container.singleton(auditServiceToken, () => service);
    expect(container.resolve(tokenFromSubpath)).toBe(service);
    expect(container.resolve(auditServiceToken)).toBe(service);
  });
  it('advertises production providers and routes without starting them at import', () => {
    expect(plugin.packageName).toBe('@nocobase/app-plugin-audit');
    expect(plugin.serviceProviders).toHaveLength(1);
    expect(plugin.routes).toHaveLength(1);
    expect(plugin.queue).toBeUndefined();
    expect(plugin.database).toEqual({
      migrations: './server/database/migrations',
    });
  });
  it('keeps business target datasource distinct from the observation store', () => {
    const query: AuditEventsQuery = {
      store: 'observations',
      target: input.target,
      pageSize: 20,
    };
    const page: AuditEventsPage = {
      items: [event],
      nextCursor: 'opaque-scoped-cursor',
    };
    expect(page.items[0]?.target?.dataSource).toBe('business');
    expect(query.store).toBe(page.items[0]?.store);
    expect(page.items[0]?.actor.type).toBe('workflow');
    expect(page.items[0]?.initiator?.type).toBe('user');
  });
  it('distinguishes all receipt states in consumer fixtures', () => {
    const receipts: readonly AuditReceipt[] = [
      { state: 'committed', eventId: 'committed-id' },
      { state: 'pending-commit', eventId: 'pending-id' },
      { state: 'disabled', reason: 'disabled-by-deployment' },
      { state: 'excluded', reason: 'not-in-policy', policyVersion: 3 },
    ];
    expect(new Set(receipts.map((receipt) => receipt.state)).size).toBe(4);
  });
  it('freezes required outcome and excludes trusted fields from ordinary input types', () => {
    expectTypeOf<AuditEventInput['outcome']>().toEqualTypeOf<
      'success' | 'failed' | 'denied' | 'accepted' | 'unknown'
    >();
    expectTypeOf<AuditEventInput['kind']>().toEqualTypeOf<undefined>();
    expectTypeOf<AuditEventInput['actor']>().toEqualTypeOf<undefined>();
    expectTypeOf<{ action: string }>().not.toExtend<AuditEventInput>();
    expectTypeOf<{
      action: string;
      outcome: 'success';
      appId: string;
    }>().not.toExtend<AuditEventInput>();
    expectTypeOf<
      AuditSettingsUpdate['expectedRevision']
    >().toEqualTypeOf<number>();
  });
});
