import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server-kit/application';

import type { AppConfig } from '../config/index.js';
import AppExampleProvider from './app-example.js';

export {
  appExampleServiceToken,
  type AppExampleService,
} from './app-example.js';

const providers: readonly ApplicationServiceProviderConstructor<AppConfig>[] = [
  AppExampleProvider,
];

export default providers;
