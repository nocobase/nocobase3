import { describe, expect, it, vi } from 'vitest';
import { ServiceContainer } from '@nocobase/service-provider';
import {
  createLogging,
  createSilentLoggingConfig,
  loggingToken,
} from '@nocobase/logging';

import {
  createSyncQueueConfig,
  QueueProvider,
  queueManagerToken,
} from '../src/index.js';

describe('QueueProvider', () => {
  it('registers and closes the configured queue manager', async () => {
    const container = new ServiceContainer();
    const provider = new QueueProvider({
      config: { queue: createSyncQueueConfig() },
      container,
    });
    container.instance(
      loggingToken,
      createLogging(createSilentLoggingConfig()),
    );

    provider.register();
    const queueManager = container.resolve(queueManagerToken);
    const close = vi.spyOn(queueManager, 'close');

    expect(provider.name).toBe('@nocobase/queue');
    await provider.shutdown();
    expect(close).toHaveBeenCalledOnce();
  });

  it('does not create the queue manager during shutdown', async () => {
    const container = new ServiceContainer();
    const provider = new QueueProvider({
      config: {},
      container,
    });

    provider.register();
    await provider.shutdown();

    expect(container.resolveIfCreated(queueManagerToken)).toBeUndefined();
  });
});
