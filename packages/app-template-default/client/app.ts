import { defineAppClient, type AppClientConfig } from '@nocobase/app-client';
import { I18nProvider } from '@nocobase/app-i18n/client';
import type { ResolvedAppRuntime } from '@nocobase/app-client/runtime';
import {
  createElement,
  type PropsWithChildren,
  type ReactElement,
} from 'react';

import { AppRouter } from './routing/app-router.js';
export function createApp(runtime: ResolvedAppRuntime): AppClientConfig {
  // Outermost, so every provider and page below can translate.
  const AppI18nProvider = ({ children }: PropsWithChildren): ReactElement =>
    createElement(I18nProvider, { runtime: runtime.i18n }, children);

  return defineAppClient({
    basename: runtime.basename,
    providers: [
      AppI18nProvider,
      ...runtime.providers.map((provider) => provider.component),
    ],
    refine: runtime.refine,
    routes: createElement(AppRouter, {
      clientRoutes: runtime.routes,
      clientSettings: runtime.settings,
      clientSettingGroups: runtime.settingGroups,
    }),
  });
}
