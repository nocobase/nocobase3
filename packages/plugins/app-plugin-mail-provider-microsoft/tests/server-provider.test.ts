import {
  createMailProviderRegistry,
  mailProviderRegistryToken,
} from '@nocobase/app-plugin-mail/server';
import { ServiceContainer } from '@nocobase/service-provider';
import { describe, expect, it } from 'vitest';

import { microsoftMailProviderDefinition } from '../server/microsoft.js';
import { MailProviderMicrosoftProvider } from '../server/providers/mail-provider-microsoft.js';

describe('@nocobase/app-plugin-mail-provider-microsoft', () => {
  it('registers the Microsoft definition during boot', async () => {
    const container = new ServiceContainer();
    const registry = createMailProviderRegistry();
    container.instance(mailProviderRegistryToken, registry);
    const provider = new MailProviderMicrosoftProvider({ container });

    expect(provider.name).toBe('@nocobase/app-plugin-mail-provider-microsoft');
    expect(registry.definition('microsoft')).toBeUndefined();

    await provider.boot();

    expect(registry.definition('microsoft')).toBe(
      microsoftMailProviderDefinition,
    );
  });
});
