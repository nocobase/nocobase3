import type { AppPluginProviderConstructor } from '@nocobase/app-server-kit/plugins';

import {
  AuthenticationProvider,
  type AuthenticationProviderConfig,
} from './authentication.js';

const serviceProviders: readonly AppPluginProviderConstructor<AuthenticationProviderConfig>[] =
  [AuthenticationProvider];

export default serviceProviders;
