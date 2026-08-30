import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server-kit/application';

import AppExampleProvider from './app-example.js';

export {
  appExampleServiceToken,
  type AppExampleService,
} from './app-example.js';

const providers: readonly ApplicationServiceProviderConstructor[] = [
  AppExampleProvider,
];

export default providers;
