import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import AppExampleProvider from './app-example.js';
import ExternalCrmProvider from './external-crm.js';

export {
  appExampleServiceToken,
  type AppExampleService,
} from './app-example.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  AppExampleProvider,
  ExternalCrmProvider,
];

export default serviceProviders;
