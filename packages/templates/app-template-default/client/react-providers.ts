import {
  defineClientReactProviders,
  type AppClientReactProviderDefinition,
} from '@nocobase/app-client/plugins';

import { Toaster } from '@/components/ui/toast';

import { AppThemeProvider } from './theme/theme-provider.js';

export const reactProviders: readonly AppClientReactProviderDefinition[] =
  defineClientReactProviders([
    {
      component: AppThemeProvider,
      layer: 'root',
      name: 'theme',
    },
    // The one toast host: application code calls `toast` from
    // `@/components/ui/toast`, and plugins reach this provider through Base
    // UI's `Toast.useToastManager()`. Pages must not mount another.
    {
      component: Toaster,
      layer: 'application',
      name: 'toaster',
    },
  ]);

export default reactProviders;
