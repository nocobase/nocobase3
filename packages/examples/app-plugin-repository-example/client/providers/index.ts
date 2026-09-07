import type { ClientServiceProviderConstructor } from '@nocobase/app-client/plugins';

import { RepositoryExampleServiceProvider } from './repository-example.js';

export const serviceProviders: readonly ClientServiceProviderConstructor[] = [
  RepositoryExampleServiceProvider,
];

export default serviceProviders;
