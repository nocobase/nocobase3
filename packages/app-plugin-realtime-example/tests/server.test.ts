import { describe, expect, it, vi } from 'vitest';
import { realtimeServiceToken } from '@nocobase/app-server-kit/realtime';
import { ServiceContainer } from '@nocobase/service-provider';

import RealtimeExampleProvider from '../server/provider.js';
import { CLOCK_TOPIC } from '../server/publishers/clock.js';

describe('realtime example plugin provider', () => {
  it('starts and shuts down the clock publisher', async () => {
    const disposeSubscription = vi.fn();
    const realtime = {
      publish: vi.fn(),
      subscriptionCount: vi.fn().mockReturnValue(0),
      onTopicSubscriptionChange: vi.fn().mockReturnValue(disposeSubscription),
    };
    const container = new ServiceContainer();
    container.instance(realtimeServiceToken, realtime);

    const provider = new RealtimeExampleProvider({
      container,
    });
    await provider.start();

    expect(realtime.onTopicSubscriptionChange).toHaveBeenCalledWith(
      CLOCK_TOPIC,
      expect.any(Function),
    );
    await provider.shutdown();
    expect(disposeSubscription).toHaveBeenCalledOnce();
  });
});
