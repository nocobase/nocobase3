import {
  defineClientReactProviders,
  type AppClientReactProviderDefinition,
} from '@nocobase/app-client/plugins';

import { AppThemeProvider } from './theme/theme-provider.js';

export const reactProviders: readonly AppClientReactProviderDefinition[] =
  defineClientReactProviders([
    {
      component: AppThemeProvider,
      layer: 'root',
      name: 'theme',
    },
  ]);

export default reactProviders;
