import type { AppPluginProviderConstructor } from '@nocobase/app-server-kit/plugins';

import { ServiceProviderExampleProvider } from './service-provider-example.js';

const serviceProviders: readonly AppPluginProviderConstructor[] = [
  ServiceProviderExampleProvider,
];

export default serviceProviders;
