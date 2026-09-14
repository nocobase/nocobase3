import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import ArticlesProvider from './articles.js';
import ScheduledLogJobProvider from './scheduled-log-job.js';

import AppExampleProvider from './app-example.js';

export {
  appExampleServiceToken,
  type AppExampleService,
} from './app-example.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  AppExampleProvider,
  ArticlesProvider,
  ScheduledLogJobProvider,
];

export default serviceProviders;
