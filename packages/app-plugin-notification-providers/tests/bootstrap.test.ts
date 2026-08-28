import {
  createNotificationRegistry,
  type NotificationService,
} from '@nocobase/app-plugin-notification';
import { describe, expect, it } from 'vitest';

import { registerBuiltInNotificationProviders } from '../server/bootstrap.js';

describe('@nocobase/app-plugin-notification-providers bootstrap', () => {
  it('registers its Email and IM definitions', () => {
    const registry = createNotificationRegistry();

    registerBuiltInNotificationProviders({ registry } as Pick<
      NotificationService,
      'registry'
    >);

    expect(registry.channel('email')?.type).toBe('email');
    expect(registry.provider('email', 'smtp')?.type).toBe('smtp');
    expect(registry.provider('email', 'resend')?.type).toBe('resend');
    expect(registry.channel('im')?.type).toBe('im');
    expect(registry.provider('im', 'feishu-webhook')?.type).toBe(
      'feishu-webhook',
    );
    expect(registry.provider('im', 'dingtalk-webhook')?.type).toBe(
      'dingtalk-webhook',
    );
  });

  it('allows the core notification service to be absent', () => {
    expect(() => registerBuiltInNotificationProviders(undefined)).not.toThrow();
  });
});
