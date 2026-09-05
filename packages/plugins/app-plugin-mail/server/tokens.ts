import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import type {
  MailCredentialVault,
  MailProviderAdapterResolver,
  MailProviderRegistry,
  MailService,
  MailStore,
} from './types.js';
import type { MailRuntime } from './runtime.js';

export const mailServiceToken: ServiceToken<MailService> =
  createServiceToken<MailService>('@nocobase/app-plugin-mail/service');

export const mailStoreToken: ServiceToken<MailStore> =
  createServiceToken<MailStore>('@nocobase/app-plugin-mail/store');

export const mailCredentialVaultToken: ServiceToken<MailCredentialVault> =
  createServiceToken<MailCredentialVault>(
    '@nocobase/app-plugin-mail/credential-vault',
  );

export const mailProviderRegistryToken: ServiceToken<MailProviderRegistry> =
  createServiceToken<MailProviderRegistry>(
    '@nocobase/app-plugin-mail/provider-registry',
  );

export const mailProviderAdapterResolverToken: ServiceToken<MailProviderAdapterResolver> =
  createServiceToken<MailProviderAdapterResolver>(
    '@nocobase/app-plugin-mail/provider-adapter-resolver',
  );

export const mailRuntimeToken: ServiceToken<MailRuntime> =
  createServiceToken<MailRuntime>('@nocobase/app-plugin-mail/runtime');
