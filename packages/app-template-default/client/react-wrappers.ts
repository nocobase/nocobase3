import {
  defineClientReactWrappers,
  type AppClientReactWrapperDefinition,
} from '@nocobase/app-client/plugins';

import { AppThemeProvider } from './theme/theme-provider.js';

export const reactWrappers: readonly AppClientReactWrapperDefinition[] =
  defineClientReactWrappers([
    {
      component: AppThemeProvider,
      layer: 'root',
      name: 'theme',
    },
  ]);

export default reactWrappers;
