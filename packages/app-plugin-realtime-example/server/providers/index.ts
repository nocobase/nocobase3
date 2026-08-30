import type { AppPluginProviderConstructor } from '@nocobase/app-server-kit/plugins';

import { RealtimeExampleProvider } from './realtime-example.js';

const providers: readonly AppPluginProviderConstructor[] = [
  RealtimeExampleProvider,
];

export default providers;
