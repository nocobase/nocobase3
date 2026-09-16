import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import ArticlesProvider from './articles.js';
import UserRolesProvider from './user-roles.js';

import AppExampleProvider from './app-example.js';
import ExternalCrmProvider from './external-crm.js';

export {
  appExampleServiceToken,
  type AppExampleService,
} from './app-example.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  UserRolesProvider,
  AppExampleProvider,
  ArticlesProvider,
  ExternalCrmProvider,
];

export default serviceProviders;
