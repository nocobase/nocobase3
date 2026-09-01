import type { AppPluginProviderConstructor } from '@nocobase/app-server/plugins';

import { RealtimeExampleProvider } from './realtime-example.js';

const serviceProviders: readonly AppPluginProviderConstructor[] = [
  RealtimeExampleProvider,
];

export default serviceProviders;
