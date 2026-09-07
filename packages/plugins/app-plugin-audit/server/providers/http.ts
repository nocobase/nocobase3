import type { Application } from '@nocobase/app-server/application';
import type { DatabaseConnection } from '@nocobase/db';
import { AuditHttpCollector, type AuditHttpCollectorOptions } from '../http.js';
import type { AuditCaptureCatalog } from '../capture-catalog.js';
import { AuditError } from '../errors.js';
import { assertAuditStoreConnection } from '../store-connection-check.js';

export interface AuditHttpResourcesOptions extends AuditHttpCollectorOptions {
  readonly application: Pick<Application, 'addHttpObserver'>;
  readonly catalog: AuditCaptureCatalog;
  readonly connections: readonly DatabaseConnection[];
}
export interface AuditHttpResources {
  readonly collector: AuditHttpCollector;
  /** Supply a real host request after route assembly, before accepting external traffic. */
  verify(probe: () => Promise<void>): Promise<void>;
  dispose(): Promise<void>;
}

const applications: WeakSet<AuditHttpResourcesOptions['application']> =
  new WeakSet();

/** Explicit infrastructure resource; G20 owns the service-token/provider composition. */
export function createAuditHttpResources(
  options: AuditHttpResourcesOptions,
): AuditHttpResources {
  if (applications.has(options.application))
    throw new AuditError('AUDIT_NOT_READY');
  if (
    options.connections.length !== options.stores.length ||
    new Set(options.connections.map((connection) => connection.name)).size !==
      options.connections.length ||
    options.connections.some(
      (connection) =>
        !options.stores.some(
          (store) => store.binding.store === connection.name,
        ),
    )
  )
    throw new AuditError('AUDIT_NOT_READY');
  const collector = new AuditHttpCollector(options);
  const detach = options.application.addHttpObserver(collector);
  applications.add(options.application);
  const handles = options.connections.map((connection) =>
    options.catalog.register({
      producer: 'audit.http',
      kind: 'request',
      connection,
      targets: [],
      dispose: async () => {
        detach();
        await collector.dispose();
        applications.delete(options.application);
      },
    }),
  );
  return {
    collector,
    verify: async (probe): Promise<void> => {
      for (const connection of options.connections) {
        const store = options.stores.find(
          (candidate) => candidate.binding.store === connection.name,
        );
        if (!store) throw new AuditError('AUDIT_NOT_READY');
        await assertAuditStoreConnection(connection, store);
      }
      for (const handle of handles)
        await handle.verify(() => collector.verifyHostProbe(probe));
    },
    dispose: async (): Promise<void> => {
      await Promise.all(handles.map((handle) => handle.dispose()));
      applications.delete(options.application);
    },
  };
}
