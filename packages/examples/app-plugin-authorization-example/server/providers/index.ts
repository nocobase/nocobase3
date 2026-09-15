import type { AppPluginProviderConstructor } from '@nocobase/app-server/plugins';

import { AuthorizationExampleProvider } from './authorization-example.js';

const serviceProviders: readonly AppPluginProviderConstructor[] = [
  AuthorizationExampleProvider,
];

export default serviceProviders;
