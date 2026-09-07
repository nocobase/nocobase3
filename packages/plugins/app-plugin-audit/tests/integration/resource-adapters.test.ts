function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
import { describe, expect, it } from 'vitest';
import { LocalAuditResourceAdapters } from '../../server/resource-adapters.js';
import {
  AuditAuthorization,
  AuditAccessDenied,
  type AuditResourceAdapter,
} from '../../server/authorization.js';
import { createQueryFixture } from '../helpers/query-fixture.js';

describe('Live resource authorization', () => {
  it('rechecks each event and rejects disposal or same-adapter replacement during awaited checks', async () => {
    const s = await createQueryFixture('sqlite');
    try {
      await s.grant(s.alice.id, ['read']);
      await s.append('a');
      const registry = new LocalAuditResourceAdapters();
      const engine = new AuditAuthorization({
        boundary: s.f.scope,
        stores: ['main'],
        adapters: () => registry.snapshot(),
      });
      const scope = s.appAuthorization.for({
        principal: { type: 'user', id: s.alice.id },
      });
      const target = { dataSource: 'main', resource: 'documents', key: 'a' };
      let pending: Promise<'allowed'> | undefined;
      let entered = (): void => undefined;
      const adapter: AuditResourceAdapter = {
        dataSource: 'main',
        resource: 'documents',
        canRead: async () => {
          entered();
          return pending ?? 'allowed';
        },
      };
      let dispose = registry.register(adapter);
      const proof = await engine.issue(scope, 'main', target);
      const event = await s.f.store.queryEvent(s.f.scope, {
        store: 'main',
        id: 'a',
      });
      if (!event) throw new Error('Expected fixture event.');
      expect(await proof.canRead(event)).toBe(true);
      for (const replace of [false, true]) {
        const gate = deferred<'allowed'>();
        const arrival = deferred<void>();
        pending = gate.promise;
        entered = () => arrival.resolve();
        const check = proof.canRead(event);
        await arrival.promise;
        dispose();
        if (replace) dispose = registry.register(adapter);
        gate.resolve('allowed');
        expect(await check).toBe(false);
        pending = undefined;
        if (!replace) dispose = registry.register(adapter);
        expect(await proof.canRead(event)).toBe(true);
      }
      registry.dispose();
      expect(await proof.canRead(event)).toBe(false);
      await expect(engine.issue(scope, 'main', target)).rejects.toBeInstanceOf(
        AuditAccessDenied,
      );
      const other = new AuditAuthorization({
        boundary: { ...s.f.scope, appId: 'other' },
        stores: ['main'],
        adapters: () => registry.snapshot(),
      });
      expect(() => other.verify(proof)).toThrow(AuditAccessDenied);
    } finally {
      await s.cleanup();
    }
  });
});
