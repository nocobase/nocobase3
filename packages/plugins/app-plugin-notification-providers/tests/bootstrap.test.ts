import { createNotificationRegistry } from '@nocobase/app-plugin-notification';
import { describe, expect, it } from 'vitest';

import { registerBuiltInNotificationProviders } from '../server/bootstrap.js';
import NotificationProvidersProvider from '../server/provider.js';
import { ServiceContainer } from '@nocobase/service-provider';

describe('@nocobase/app-plugin-notification-providers bootstrap', () => {
  it('registers its Email and IM definitions', () => {
    const registry = createNotificationRegistry();

    registerBuiltInNotificationProviders(registry);

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

  it('fails fast when the required extension registry is absent', async () => {
    const provider = new NotificationProvidersProvider({
      container: new ServiceContainer(),
    });

    await expect(provider.boot()).rejects.toThrow(
      'Built-in notification Providers require the notification extension registry.',
    );
  });
});
