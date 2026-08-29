import type { AppPluginProviderConstructor } from '@nocobase/app-server-kit/plugins';

import { AuthorizationProvider } from './authorization.js';

const providers: readonly AppPluginProviderConstructor[] = [
  AuthorizationProvider,
];

export default providers;
