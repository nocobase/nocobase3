import type { AppPluginProviderConstructor } from '@nocobase/app-server/plugins';

import { MailCoreProvider } from './mail-core.js';

export const serviceProviders: readonly AppPluginProviderConstructor[] = [
  MailCoreProvider,
];

export default serviceProviders;
