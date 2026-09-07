import type { AppPluginProviderConstructor } from '@nocobase/app-server/plugins';
import { AuditProvider } from './composition.js';
const serviceProviders: readonly AppPluginProviderConstructor[] = [
  AuditProvider,
];
export default serviceProviders;
