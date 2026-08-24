import {
  defineClientProviders,
  type AppClientProviderDefinition,
} from '@nocobase/app-client/plugins';

import { AppThemeProvider } from './theme/index.js';

const providers: readonly AppClientProviderDefinition[] = defineClientProviders(
  [
    {
      component: AppThemeProvider,
      layer: 'root',
      name: 'theme',
    },
  ],
);

export default providers;
