import { ServiceContainer } from '@nocobase/service-provider';
import { describe, expect, it } from 'vitest';

import { mailProviderRegistryToken } from '@nocobase/app-plugin-mail/server/tokens';
import { createMailProviderRegistry } from '../../app-plugin-mail/server/registry.js';
import { imapSmtpMailProviderDefinition } from '../server/imap-smtp.js';
import { MailProviderImapSmtpProvider } from '../server/providers/mail-provider-imap-smtp.js';

describe('@nocobase/app-plugin-mail-provider-imap-smtp', () => {
  it('registers its Provider definition with the Mail registry', async () => {
    const container = new ServiceContainer();
    const registry = createMailProviderRegistry();
    container.instance(mailProviderRegistryToken, registry);
    const provider = new MailProviderImapSmtpProvider({ container });

    expect(provider.name).toBe('@nocobase/app-plugin-mail-provider-imap-smtp');
    await provider.boot();
    expect(registry.definition('imap-smtp')).toBe(
      imapSmtpMailProviderDefinition,
    );
  });
});
