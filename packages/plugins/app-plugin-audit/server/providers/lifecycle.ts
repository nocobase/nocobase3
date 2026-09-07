import type { AuditCaptureCatalog } from '../capture-catalog.js';
import type { TrustedAuditRuntime } from '../runtime.js';
import type { AuditRetentionService } from '../retention-service.js';
import type { AuditRetentionQueueResources } from '../queue/retention.js';

export interface AuditLifecycleOptions {
  /** The host closes admission synchronously, then waits for accepted requests/jobs. */
  readonly stopAccepting: () => void;
  readonly drainHost: () => Promise<void>;
  readonly retention: readonly AuditRetentionService[];
  readonly queues: readonly AuditRetentionQueueResources[];
  /** HTTP resources precede database collectors: accepted requests may still execute queries. */
  readonly http: readonly { dispose(): Promise<void> }[];
  readonly database: readonly { dispose(): Promise<void> }[];
  readonly catalog: AuditCaptureCatalog;
  readonly runtime: TrustedAuditRuntime;
}
export interface AuditLifecycleResources {
  dispose(): Promise<void>;
}

/** Register after database/queue providers so reverse host shutdown drains audit before connections close. */
export function createAuditLifecycleResources(
  options: AuditLifecycleOptions,
): AuditLifecycleResources {
  let disposal: Promise<void> | undefined;
  return {
    dispose: (): Promise<void> => {
      disposal ??= (async (): Promise<void> => {
        const errors: unknown[] = [];
        const stop = (callback: () => void): void => {
          try {
            callback();
          } catch (error) {
            errors.push(error);
          }
        };
        stop(() => options.stopAccepting());
        for (const queue of options.queues) stop(() => queue.stopAccepting());
        for (const retention of options.retention)
          stop(() => retention.stopAccepting());
        // Keep accepted work tracked even when admission or host draining reports an error.
        const release = async (
          callback: () => void | Promise<void>,
        ): Promise<void> => {
          try {
            await callback();
          } catch (error) {
            errors.push(error);
          }
        };
        await release(() => options.drainHost());
        for (const resource of options.http)
          await release(() => resource.dispose());
        for (const queue of options.queues)
          await release(() => queue.dispose());
        for (const retention of options.retention)
          await release(() => retention.drain());
        for (const resource of options.database)
          await release(() => resource.dispose());
        await release(() => options.catalog.dispose());
        await release(() => options.runtime.dispose());
        if (errors.length)
          throw new AggregateError(errors, 'Audit lifecycle shutdown failed.');
      })();
      return disposal;
    },
  };
}
