import { describe, expect, it } from 'vitest';
import { LocalAuditResourceAdapters } from '../../server/resource-adapters.js';
import type { AuditResourceAdapter } from '../../server/authorization.js';

const adapter: AuditResourceAdapter = {
  dataSource: 'main',
  resource: 'documents',
  canRead: async () => 'allowed',
};

describe('App resource adapter registration', () => {
  it('rejects duplicates and makes disposal idempotent across re-registration', () => {
    const registry = new LocalAuditResourceAdapters();
    const dispose = registry.register(adapter);
    expect(() => registry.register(adapter)).toThrow('already registered');
    expect(() => registry.register({ ...adapter })).toThrow(
      'already registered',
    );
    const first = registry.snapshot()[0];
    dispose();
    const next = registry.register(adapter);
    expect(registry.snapshot()[0]).not.toBe(first);
    dispose();
    expect(registry.snapshot()).toHaveLength(1);
    next();
    next();
    expect(registry.snapshot()).toEqual([]);
  });
  it('isolates Apps, accepts independent resource keys and closes permanently', () => {
    const first = new LocalAuditResourceAdapters();
    const second = new LocalAuditResourceAdapters();
    const dispose = first.register(adapter);
    second.register(adapter);
    first.register({ ...adapter, dataSource: 'other' });
    first.register({ ...adapter, resource: 'other' });
    expect(first.snapshot()).toHaveLength(3);
    first.dispose();
    first.dispose();
    dispose();
    expect(first.snapshot()).toEqual([]);
    expect(second.snapshot()).toHaveLength(1);
    expect(() => first.register(adapter)).toThrow('closed');
  });
  it('snapshots keys and callback without freezing the owner object', () => {
    const registry = new LocalAuditResourceAdapters();
    const mutable = { ...adapter };
    registry.register(mutable);
    mutable.resource = 'other';
    mutable.canRead = async () => 'denied';
    expect(registry.snapshot()[0].resource).toBe('documents');
    expect(Object.isFrozen(registry.snapshot()[0])).toBe(true);
    expect(Object.isFrozen(mutable)).toBe(false);
    expect(() => registry.register({ ...adapter, dataSource: '' })).toThrow(
      'Invalid',
    );
  });
});
