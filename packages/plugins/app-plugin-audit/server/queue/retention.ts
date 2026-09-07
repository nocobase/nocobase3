import { createHash } from 'node:crypto';
import type { DatabaseManager } from '@nocobase/db';
import type { NocoBaseQueueManager } from '@nocobase/queue';
import { AuditError } from '../errors.js';
import type { AuditRetentionService } from '../retention-service.js';
import type { AuditStoreBinding } from '../store.js';
import AuditRetentionJob, { bindRetentionJob } from './retention-job.js';

export interface AuditRetentionQueueResources {
  /** May be called by the host's existing scheduler; no process-local timer is created. */
  dispatch(): Promise<void>;
  stopAccepting(): void;
  dispose(): Promise<void>;
}
export function createAuditRetentionQueueResources(options: {
  readonly database: DatabaseManager;
  readonly queue: NocoBaseQueueManager;
  readonly binding: AuditStoreBinding;
  readonly service: AuditRetentionService;
}): AuditRetentionQueueResources {
  options.service.assertJobBinding(options.binding);
  const key = createHash('sha256')
    .update(
      JSON.stringify([
        options.binding.appId,
        options.binding.securityScope ?? null,
        options.binding.store,
      ]),
    )
    .digest('hex');
  const detach = bindRetentionJob(options.database, key, options.service);
  try {
    options.queue.registerJob(AuditRetentionJob);
  } catch (error) {
    detach();
    throw error;
  }
  let accepting = true;
  const pending = new Set<Promise<unknown>>();
  return {
    dispatch: async (): Promise<void> => {
      if (!accepting) throw new AuditError('AUDIT_NOT_READY');
      const task = (async (): Promise<unknown> => {
        options.service.assertJobDatabase(options.database);
        const plan = await options.service.plan();
        if (!plan) return;
        if (!accepting) throw new AuditError('AUDIT_NOT_READY');
        return options.queue.dispatch(AuditRetentionJob, {
          binding: key,
          ...plan,
        });
      })();
      pending.add(task);
      try {
        await task;
      } finally {
        pending.delete(task);
      }
    },
    stopAccepting: (): void => {
      accepting = false;
      options.service.stopAccepting();
    },
    dispose: async (): Promise<void> => {
      accepting = false;
      options.service.stopAccepting();
      await Promise.allSettled([...pending]);
      await options.service.drain();
      detach();
    },
  };
}
