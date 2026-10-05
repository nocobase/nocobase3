import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import SchedulesProvider from './schedules.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  SchedulesProvider,
];

export default serviceProviders;
