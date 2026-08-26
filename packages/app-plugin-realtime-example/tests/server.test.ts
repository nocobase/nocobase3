import { describe, expect, it, vi } from 'vitest';

import bootstrap from '../server/bootstrap.js';
import { CLOCK_TOPIC } from '../server/publishers/clock.js';

describe('realtime example plugin bootstrap', () => {
  it('registers the clock publisher disposer', () => {
    const registerDisposer = vi.fn();
    const disposeSubscription = vi.fn();
    const realtime = {
      publish: vi.fn(),
      subscriptionCount: vi.fn().mockReturnValue(0),
      onTopicSubscriptionChange: vi.fn().mockReturnValue(disposeSubscription),
    };

    bootstrap({
      config: undefined,
      deps: undefined,
      services: { realtime },
      lifecycle: { registerDisposer },
    });

    expect(realtime.onTopicSubscriptionChange).toHaveBeenCalledWith(
      CLOCK_TOPIC,
      expect.any(Function),
    );
    expect(registerDisposer).toHaveBeenCalledWith(
      'clock-publisher',
      expect.any(Function),
    );

    const dispose = registerDisposer.mock.calls[0]?.[1] as
      (() => void) | undefined;
    expect(dispose).toBeTypeOf('function');
    dispose?.();
    expect(disposeSubscription).toHaveBeenCalledOnce();
  });
});
