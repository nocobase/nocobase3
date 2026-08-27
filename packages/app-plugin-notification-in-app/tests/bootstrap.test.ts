import type { DatabaseManager } from '@nocobase/app-database';
import type { NotificationService } from '@nocobase/app-plugin-notification';
import type { RealtimeService } from '@nocobase/app-server-kit/realtime';
import { describe, expect, it, vi } from 'vitest';

import bootstrapInAppNotificationPlugin, {
  getInAppNotificationStore,
} from '../server/bootstrap.js';

describe('@nocobase/app-plugin-notification-in-app bootstrap', () => {
  it('registers its Channel and Provider with the core manager', () => {
    const registerProvider = vi.fn();
    const registerChannel = vi.fn(() => ({ registerProvider }));
    const closeTopic = vi.fn();
    const defineTopic = vi.fn(() => ({
      audience: 'user',
      name: 'notifications:in-app',
      publishFor: vi.fn(),
      close: closeTopic,
    }));
    const registerDisposer = vi.fn();
    const notification = {
      registry: { registerChannel },
    } as unknown as NotificationService;

    bootstrapInAppNotificationPlugin({
      config: undefined,
      deps: { database: {} as DatabaseManager },
      services: {
        notification,
        realtime: { defineTopic } as unknown as RealtimeService,
      },
      lifecycle: { registerDisposer },
    });

    expect(registerChannel).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'in-app' }),
    );
    expect(registerProvider).toHaveBeenCalledWith(
      'in-app',
      expect.objectContaining({ type: 'database' }),
    );
    expect(getInAppNotificationStore(notification)).toBeDefined();
    expect(defineTopic).toHaveBeenCalledWith('notifications:in-app', {
      audience: 'user',
    });
    expect(registerDisposer).toHaveBeenCalledWith(
      'realtime-topic',
      expect.any(Function),
    );
  });

  it('does nothing when the core notification service is unavailable', () => {
    expect(() =>
      bootstrapInAppNotificationPlugin({
        config: undefined,
        deps: { database: undefined },
        services: { notification: undefined },
        lifecycle: { registerDisposer() {} },
      }),
    ).not.toThrow();
  });

  it('rejects an in-memory fallback when the core service is available', () => {
    const notification = {
      registry: {},
    } as unknown as NotificationService;

    expect(() =>
      bootstrapInAppNotificationPlugin({
        config: undefined,
        deps: { database: undefined },
        services: { notification },
        lifecycle: { registerDisposer() {} },
      }),
    ).toThrow(
      'In-app notifications require the application database dependency.',
    );
  });
});
