import { useClientApplication } from '@nocobase/app-client';
import {
  defineClientReactProviders,
  type AppClientReactProviderDefinition,
} from '@nocobase/app-client/plugins';
import {
  createElement,
  Fragment,
  useEffect,
  type PropsWithChildren,
  type ReactElement,
} from 'react';

import { AppThemeProvider } from './theme/theme-provider.js';

function AppDocumentTitleProvider({
  children,
}: PropsWithChildren): ReactElement {
  const app = useClientApplication();
  const configuredTitle = app.config.get<unknown>('app.title');
  const title =
    typeof configuredTitle === 'string' ? configuredTitle.trim() : '';

  useEffect(() => {
    if (!title) return;
    const previousTitle = document.title;
    document.title = title;
    return (): void => {
      document.title = previousTitle;
    };
  }, [title]);

  return createElement(Fragment, null, children);
}

export const reactProviders: readonly AppClientReactProviderDefinition[] =
  defineClientReactProviders([
    {
      component: AppDocumentTitleProvider,
      layer: 'root',
      name: 'document-title',
    },
    {
      component: AppThemeProvider,
      layer: 'root',
      name: 'theme',
    },
  ]);

export default reactProviders;
