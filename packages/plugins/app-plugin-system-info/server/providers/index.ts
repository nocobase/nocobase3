import type { AppPluginProviderConstructor } from '@nocobase/app-server/plugins';

import { SystemInfoProvider } from './system-info.js';

const serviceProviders: readonly AppPluginProviderConstructor[] = [
  SystemInfoProvider,
];

export default serviceProviders;
