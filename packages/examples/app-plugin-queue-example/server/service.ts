import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import type {
  QueueExampleExecution,
  QueueExamplePayload,
} from './jobs/queue-example.js';

/** App-local demonstration state, not a durable execution ledger. */
export class QueueExampleService {
  private readonly executions: QueueExampleExecution[] = [];

  public listExecutions(): QueueExampleExecution[] {
    return this.executions.map((execution) => ({ ...execution }));
  }

  public async execute(
    payload: QueueExamplePayload,
    signal: AbortSignal,
  ): Promise<void> {
    signal.throwIfAborted();
    this.executions.push({
      ...payload,
      executedAt: new Date().toISOString(),
    });
  }
}

export const queueExampleServiceToken: ServiceToken<QueueExampleService> =
  createServiceToken<QueueExampleService>(
    '@nocobase/app-plugin-queue-example/service',
  );
