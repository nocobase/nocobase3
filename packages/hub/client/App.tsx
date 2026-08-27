import { AppClientRoot, type AppClientProvider } from '@nocobase/app-client';
import {
  createNotificationProvider,
  providers as notificationProviders,
} from '@nocobase/app-plugin-notification-provider/client';
import { i18nProvider } from '@nocobase/app-portal-sdk/i18n';
import { getPortalBase } from '@nocobase/app-portal-sdk/runtime';
import { type ResourceProps } from '@refinedev/core';
import { UnsavedChangesNotifier } from '@refinedev/react-router';

import { DocumentTitleHandler } from './components/app-shell/document-title-handler';
import { ThemeProvider } from './components/theme/theme-provider';
import { TooltipProvider } from './components/ui/tooltip';
import { BrandLogo } from './components/app-shell/brand';
import { configuredResources } from './app/extensions';
import './App.css';
import { AppRoutes } from './app/routes';
import { authProvider } from './auth';

const getResourcePriority = (resource: ResourceProps) =>
  typeof resource.meta?.priority === 'number' ? resource.meta.priority : 100;

const appResources = [...configuredResources].sort(
  (left, right) => getResourcePriority(left) - getResourcePriority(right),
);

const basename = getPortalBase().replace(/\/+$/, '');
const notificationProvider = createNotificationProvider({ undoLabel: '撤销' });

const providers: readonly AppClientProvider[] = [
  ThemeProvider,
  TooltipProvider,
  ...notificationProviders.map((provider) => provider.component),
];

function App() {
  return (
    <AppClientRoot
      config={{
        basename,
        providers,
        refine: {
          notificationProvider,
          authProvider,
          i18nProvider,
          resources: appResources,
          options: {
            syncWithLocation: true,
            warnWhenUnsavedChanges: true,
            disableTelemetry: true,
            title: {
              text: 'NocoBase',
              icon: <BrandLogo className='size-14 rounded-2xl' />,
            },
          },
        },
        routes: (
          <>
            <AppRoutes />
            <UnsavedChangesNotifier />
            <DocumentTitleHandler appName='NocoBase' />
          </>
        ),
      }}
    />
  );
}

export default App;
