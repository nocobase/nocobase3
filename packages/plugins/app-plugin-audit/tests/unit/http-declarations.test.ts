import { afterEach, describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { createDatabaseManager } from '@nocobase/db';
import { AuditHttpCollector } from '../../server/http.js';
import { PortableAuditStore } from '../../server/store.js';
import { TrustedAuditRuntime } from '../../server/runtime.js';
import { NodeAuditScopeCarrier } from '../../server/scope.js';
import { DisabledAuditRecorder } from '../../server/disabled-recorder.js';
import { createCaptureServices } from '../helpers/capture-services.js';

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

function collector(): AuditHttpCollector {
  // Connections stay unopened: declaration validation never reads or writes data.
  const manager = createDatabaseManager({
    connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
  });
  const connection = manager.connection();
  const store = new PortableAuditStore(connection, {
    appId: 'app',
    store: 'main',
  });
  const runtime = new TrustedAuditRuntime({
    appId: 'app',
    carrier: new NodeAuditScopeCarrier('app'),
    bind: () => new DisabledAuditRecorder('declaration validation only'),
    diagnostic: () => undefined,
  });
  cleanups.push(async () => {
    runtime.dispose();
    await manager.destroy();
  });
  return new AuditHttpCollector({
    ...createCaptureServices([{ connection, store }]),
    runtime,
    stores: [store],
  });
}

describe('mounted HTTP declarations', () => {
  it('rejects overlapping declarations, including equal actions with different extractors', () => {
    const audit = collector();
    for (const scenario of [
      'same route',
      'parent wildcard',
      'different extractor',
    ]) {
      const root = new Hono();
      const child = new Hono();
      child.onError((_error, context) => context.text('handled', 500));
      const first = audit.http({ action: 'orders.first' });
      const second = audit.http({
        action:
          scenario === 'different extractor' ? 'orders.first' : 'orders.second',
        details: () => ({ source: 'second' }),
      });
      if (scenario === 'parent wildcard') root.use('/orders/*', first);
      else child.use('/:id', first);
      child.get('/:id', second);
      root.route('/orders', child);
      expect(() => audit.validateRoutes(root.routes)).toThrow(
        'AUDIT_INVALID_EVENT',
      );
    }
  });

  it('rejects reuse of a declaration after any captured field changes', () => {
    const audit = collector();
    for (const field of ['action', 'titleKey', 'target', 'details'] as const) {
      const child = new Hono();
      child.onError((_error, context) => context.text('handled', 500));
      const shared = {
        action: 'orders.first',
        titleKey: 'orders.first',
        target: () => undefined,
        details: () => ({ source: 'first' }),
      };
      child.get('/:id', audit.http(shared));
      if (field === 'action') shared.action = 'orders.second';
      if (field === 'titleKey') shared.titleKey = 'orders.second';
      if (field === 'target') shared.target = () => undefined;
      if (field === 'details') shared.details = () => ({ source: 'second' });
      child.get('/:id', audit.http(shared));
      expect(() =>
        audit.validateRoutes(new Hono().route('/orders', child).routes),
      ).toThrow('AUDIT_INVALID_EVENT');
    }
  });
});
