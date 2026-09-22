import type { ServiceResolver, ServiceToken } from '@nocobase/service-provider';

/** Standalone database tasks have no application services unless supplied by their owner. */
export const emptyDatabaseTaskContainer: ServiceResolver = Object.freeze({
  has: () => false,
  resolve<T>(token: ServiceToken<T>): T {
    throw new Error(
      `Service "${token.name}" is not registered in the database task container.`,
    );
  },
  resolveIfCreated: () => undefined,
});
