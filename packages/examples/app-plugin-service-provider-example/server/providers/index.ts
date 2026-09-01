import type { AppPluginProviderConstructor } from '@nocobase/app-server/plugins';

import { ServiceProviderExampleProvider } from './service-provider-example.js';

const serviceProviders: readonly AppPluginProviderConstructor[] = [
  ServiceProviderExampleProvider,
];

export default serviceProviders;
