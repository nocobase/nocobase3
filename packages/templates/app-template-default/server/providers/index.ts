import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import UserRolesProvider from './user-roles.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  UserRolesProvider,
];

export default serviceProviders;
