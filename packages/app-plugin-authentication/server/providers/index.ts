import type { AppPluginProviderConstructor } from '@nocobase/app-server-kit/plugins';

import {
  AuthenticationProvider,
  type AuthenticationProviderConfig,
} from './authentication.js';

const providers: readonly AppPluginProviderConstructor<AuthenticationProviderConfig>[] =
  [AuthenticationProvider];

export default providers;
