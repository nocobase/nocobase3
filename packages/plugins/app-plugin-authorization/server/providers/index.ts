import type { AppPluginProviderConstructor } from '@nocobase/app-server/plugins';

import { AuthorizationProvider } from './authorization.js';

const serviceProviders: readonly AppPluginProviderConstructor[] = [
  AuthorizationProvider,
];

export default serviceProviders;
