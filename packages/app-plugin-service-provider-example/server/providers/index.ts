import type { AppPluginProviderConstructor } from '@nocobase/app-server-kit/plugins';

import { ServiceProviderExampleProvider } from './service-provider-example.js';

const providers: readonly AppPluginProviderConstructor[] = [
  ServiceProviderExampleProvider,
];

export default providers;
