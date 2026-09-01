import type { AppPluginProviderConstructor } from '@nocobase/app-server/plugins';

import {
  AuthenticationProvider,
  type AuthenticationProviderConfig,
} from './authentication.js';

const serviceProviders: readonly AppPluginProviderConstructor<AuthenticationProviderConfig>[] =
  [AuthenticationProvider];

export default serviceProviders;
