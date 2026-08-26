import { describe, expect, it, vi } from 'vitest';

import bootstrapNotificationPlugin from '../server/bootstrap.js';
import type { NotificationService } from '../server/types.js';

describe('@nocobase/app-plugin-notification bootstrap', () => {
  it('registers the core manager disposer', async () => {
    const close = vi.fn(async (): Promise<void> => undefined);
    const registerDisposer = vi.fn();

    bootstrapNotificationPlugin({
      config: undefined,
      deps: undefined,
      services: {
        notification: { close } as unknown as NotificationService,
      },
      lifecycle: { registerDisposer },
    });

    expect(registerDisposer).toHaveBeenCalledWith(
      'manager',
      expect.any(Function),
    );
    const dispose = registerDisposer.mock.calls[0]?.[1] as
      (() => Promise<void>) | undefined;
    await dispose?.();
    expect(close).toHaveBeenCalledOnce();
  });

  it('does nothing when the app did not create notification services', () => {
    const registerDisposer = vi.fn();

    bootstrapNotificationPlugin({
      config: undefined,
      deps: undefined,
      services: { notification: undefined },
      lifecycle: { registerDisposer },
    });

    expect(registerDisposer).not.toHaveBeenCalled();
  });
});
