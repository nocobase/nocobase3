import type { AppPluginProviderConstructor } from '@nocobase/app-server/plugins';

import { UsersProvider } from './users.js';

export const serviceProviders: readonly AppPluginProviderConstructor[] = [
  UsersProvider,
];

export default serviceProviders;
