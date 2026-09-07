import { describe, expect, it } from 'vitest';
import { LocalAuditHealthService } from '../../server/health-service.js';
import {
  snapshotAuditSettings,
  snapshotAuditSettingsUpdate,
} from '../../server/settings-validation.js';

describe('local health', () => {
  it('distinguishes disabled, ready without events, healthy, partial, misconfigured and faults', () => {
    const health = new LocalAuditHealthService(() => undefined, 'local');
    expect(health.get().state).toBe('disabled');
    health.setState('ready-no-events');
    expect(health.get().state).toBe('ready-no-events');
    health.report({
      producer: 'runtime',
      store: 'main',
      configured: true,
      registered: true,
      observed: false,
    });
    health.success('runtime', 'main');
    expect(health.get().state).toBe('healthy');
    health.setState('partial-coverage');
    expect(health.get().state).toBe('partial-coverage');
    health.setState('misconfigured');
    expect(health.get().state).toBe('misconfigured');
    health.failure('AUDIT_WRITE_FAILED', 'runtime', 'main');
    expect(health.get().state).toBe('degraded');
    expect(health.observe({ instanceId: 'remote' })).toMatchObject({
      observation: 'unknown',
      dataSources: [],
      coverage: [],
    });
  });

  it('remains queryable if both the database and existing diagnostic sink fail', () => {
    const health = new LocalAuditHealthService(() => {
      throw new Error('SYNTHETIC_SECRET');
    });
    health.failure('AUDIT_WRITE_FAILED', 'runtime', 'main');
    expect(health.get().state).toBe('degraded');
    expect(JSON.stringify(health.observe())).not.toContain('SYNTHETIC_SECRET');
    expect(health.observe({ store: 'absent' }).coverage).toEqual([]);
  });

  it('rejects malformed persisted policy and freezes nested snapshots', () => {
    const valid = {
      revision: 1,
      enabled: true,
      observationStore: 'main',
      sources: { http: 'disabled', runtime: 'disabled', database: [] },
      retentionDays: null,
      maxDetailsBytes: 65536,
    };
    expect(Object.isFrozen(snapshotAuditSettings(valid).sources.database)).toBe(
      true,
    );
    for (const invalid of [
      { ...valid, retentionDays: 0 },
      { ...valid, auditRequired: false },
      { ...valid, maxDetailsBytes: 0 },
    ])
      expect(() => snapshotAuditSettings(invalid)).toThrow(
        'AUDIT_POLICY_CONFLICT',
      );
    const getter = Object.defineProperty({}, 'revision', {
      enumerable: true,
      get() {
        throw new Error('MUST_NOT_CALL');
      },
    });
    expect(() => snapshotAuditSettings(getter)).toThrow(
      'AUDIT_POLICY_CONFLICT',
    );
  });
});

it('does not call update getters or label an unobserved data source healthy', () => {
  let invoked = false;
  const settings = Object.defineProperty({}, 'enabled', {
    enumerable: true,
    get() {
      invoked = true;
      return false;
    },
  });
  expect(() =>
    snapshotAuditSettingsUpdate({
      expectedRevision: 1,
      settings,
      confirmRetentionReduction: false,
    }),
  ).toThrow('AUDIT_POLICY_CONFLICT');
  expect(invoked).toBe(false);
  const health = new LocalAuditHealthService(() => undefined);
  health.setState('ready-no-events');
  expect(health.observe({ store: 'unobserved' })).toMatchObject({
    observation: 'unknown',
    scope: 'unobserved-data-source',
  });
  health.failure('AUDIT_WRITE_FAILED', 'runtime', 'main');
  expect(health.get().state).toBe('degraded');
  health.success('runtime', 'main');
  expect(health.get().state).toBe('healthy');
});
