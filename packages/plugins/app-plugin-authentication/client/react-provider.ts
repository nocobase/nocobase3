import {
  defineClientReactProviders,
  type AppClientReactProviderDefinition,
} from '@nocobase/app-client/plugins';
import { AuthenticationProvider } from './auth-provider.js';
const reactProviders: readonly AppClientReactProviderDefinition[] =
  defineClientReactProviders([
    { name: 'authentication', component: AuthenticationProvider },
  ]);
export default reactProviders;
