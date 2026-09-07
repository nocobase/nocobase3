import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

export type DatabaseLifecyclePhase = 'migrations' | 'seeds';
export interface DatabaseLifecycleResult {
  readonly phase: DatabaseLifecyclePhase;
  readonly outcome: 'success' | 'failed' | 'unknown';
  readonly code:
    | 'DATABASE_TASK_COMPLETED'
    | 'DATABASE_TASK_FAILED'
    | 'DATABASE_TASK_SKIPPED';
}

/** Trusted host composition; callbacks never receive configuration, SQL or original errors. */
export interface DatabaseLifecycleObserver {
  /** May reject before any migration or seed runs; resolve the recorder lazily here. */
  before(phase: DatabaseLifecyclePhase): Promise<void>;
  after(result: DatabaseLifecycleResult): Promise<void>;
}
export const databaseLifecycleObserverToken: ServiceToken<DatabaseLifecycleObserver> =
  createServiceToken<DatabaseLifecycleObserver>(
    '@nocobase/app-server/database/lifecycle-observer',
  );
