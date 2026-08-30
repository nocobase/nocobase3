import type { AppPluginProviderConstructor } from '@nocobase/app-server-kit/plugins';

import { SystemInfoProvider } from './system-info.js';

const providers: readonly AppPluginProviderConstructor[] = [SystemInfoProvider];

export default providers;
