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
    const serviceContainer = new ServiceContainer();
    const provider = new QueueProvider({
      runtime: { config: { queue: createSyncQueueConfig() } },
      serviceContainer,
    });
    serviceContainer.instance(
      loggingToken,
      createLogging(createSilentLoggingConfig()),
    );

    provider.register();
    const queueManager = serviceContainer.resolve(queueManagerToken);
    const close = vi.spyOn(queueManager, 'close');

    expect(provider.name).toBe('@nocobase/queue');
    await provider.shutdown();
    expect(close).toHaveBeenCalledOnce();
  });

  it('does not create the queue manager during shutdown', async () => {
    const serviceContainer = new ServiceContainer();
    const provider = new QueueProvider({
      runtime: { config: {} },
      serviceContainer,
    });

    provider.register();
    await provider.shutdown();

    expect(
      serviceContainer.resolveIfCreated(queueManagerToken),
    ).toBeUndefined();
  });
});
