import type { AppPluginProviderConstructor } from '@nocobase/app-server/plugins';

import { AuditExampleProvider } from './audit-example.js';

export const serviceProviders: readonly AppPluginProviderConstructor[] = [
  AuditExampleProvider,
];

export default serviceProviders;
