import type { AppPluginProviderConstructor } from '@nocobase/app-server/plugins';

import { UsernameProvider } from './username.js';

import {
  AuthenticationProvider,
  type AuthenticationProviderConfig,
} from './authentication.js';

const serviceProviders: readonly AppPluginProviderConstructor<AuthenticationProviderConfig>[] =
  [AuthenticationProvider, UsernameProvider];

export default serviceProviders;
