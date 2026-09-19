import type { AppPluginProviderConstructor } from '@nocobase/app-server/plugins';

import { AuditProvider } from './audit.js';

export const serviceProviders: readonly AppPluginProviderConstructor[] = [
  AuditProvider,
];

export default serviceProviders;
