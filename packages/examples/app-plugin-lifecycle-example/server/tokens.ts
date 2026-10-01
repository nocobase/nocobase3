import type {
  AvailableTransition,
  LifecycleDescription,
  RecordHistory,
} from '@nocobase/lifecycle';
import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import type { LifecycleExampleService } from './services/lifecycle-example.js';

export type ExampleLifecycleName = 'tickets' | 'expenses';
export type Plain = Record<string, unknown>;

/** A record with what the page needs to act on it and to explain it. */
export interface RecordDetail {
  readonly record: Plain;
  readonly available: readonly AvailableTransition[];
  readonly history: RecordHistory;
  readonly description: LifecycleDescription;
  readonly parameters: object;
}

export const lifecycleExampleServiceToken: ServiceToken<LifecycleExampleService> =
  createServiceToken<LifecycleExampleService>(
    '@nocobase/app-plugin-lifecycle-example/service',
  );
