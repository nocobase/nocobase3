import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import ScheduledLogJobProvider from './scheduled-log-job.js';

import AppExampleProvider from './app-example.js';
import ExternalCrmProvider from './external-crm.js';

export {
  appExampleServiceToken,
  type AppExampleService,
} from './app-example.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  AppExampleProvider,
  ScheduledLogJobProvider,
  ExternalCrmProvider,
];

export default serviceProviders;
