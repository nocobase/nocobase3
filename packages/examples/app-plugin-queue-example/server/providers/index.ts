import type { AppPluginProviderConstructor } from '@nocobase/app-server/plugins';

import { QueueExampleProvider } from '../provider.js';

const serviceProviders: readonly AppPluginProviderConstructor[] = [
  QueueExampleProvider,
];

export default serviceProviders;
