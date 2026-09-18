import type { AppPluginProviderConstructor } from '@nocobase/app-server/plugins';

import { SchedulerProvider } from './scheduler.js';

export const serviceProviders: readonly AppPluginProviderConstructor[] = [
  SchedulerProvider,
];

export default serviceProviders;
