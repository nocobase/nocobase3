import type { AppPluginProviderConstructor } from '@nocobase/app-server/plugins';

import { MailProviderMicrosoftProvider } from './mail-provider-microsoft.js';

export const serviceProviders: readonly AppPluginProviderConstructor[] = [
  MailProviderMicrosoftProvider,
];

export default serviceProviders;
