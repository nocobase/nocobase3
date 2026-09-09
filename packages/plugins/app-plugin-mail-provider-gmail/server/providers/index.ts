import type { AppPluginProviderConstructor } from '@nocobase/app-server/plugins';

import { MailProviderGmailProvider } from './mail-provider-gmail.js';

export const serviceProviders: readonly AppPluginProviderConstructor[] = [
  MailProviderGmailProvider,
];

export default serviceProviders;
