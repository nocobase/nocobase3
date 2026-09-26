import type { AppPluginProviderConstructor } from '@nocobase/app-server/plugins';

import { OrganizationProvider } from './organization.js';

export const serviceProviders: readonly AppPluginProviderConstructor[] = [
  OrganizationProvider,
];

export default serviceProviders;
