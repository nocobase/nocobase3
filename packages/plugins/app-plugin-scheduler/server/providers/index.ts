import type { AppPluginProviderConstructor } from '@nocobase/app-server/plugins';

import { SchedulerAuthorizationProvider } from '../authorization.js';

import { SchedulerProvider } from './scheduler.js';

export const serviceProviders: readonly AppPluginProviderConstructor[] = [
  SchedulerAuthorizationProvider,
  SchedulerProvider,
];

export default serviceProviders;
