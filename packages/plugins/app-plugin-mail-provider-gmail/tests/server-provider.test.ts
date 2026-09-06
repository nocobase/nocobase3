import {
  createMailProviderRegistry,
  mailProviderRegistryToken,
} from '@nocobase/app-plugin-mail/server';
import { ServiceContainer } from '@nocobase/service-provider';
import { describe, expect, it } from 'vitest';

import { gmailMailProviderDefinition } from '../server/gmail.js';
import { MailProviderGmailProvider } from '../server/providers/mail-provider-gmail.js';

describe('@nocobase/app-plugin-mail-provider-gmail', () => {
  it('registers the Gmail definition during boot', async () => {
    const container = new ServiceContainer();
    const registry = createMailProviderRegistry();
    container.instance(mailProviderRegistryToken, registry);
    const provider = new MailProviderGmailProvider({ container });

    expect(provider.name).toBe('@nocobase/app-plugin-mail-provider-gmail');
    expect(registry.definition('gmail')).toBeUndefined();

    await provider.boot();

    expect(registry.definition('gmail')).toBe(gmailMailProviderDefinition);
  });
});
