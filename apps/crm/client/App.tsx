import { AppClientRoot, type AppClientProvider } from '@nocobase/app-client';
import {
  createNotificationProvider,
  providers as notificationProviders,
} from '@nocobase/app-plugin-notification-provider/client';
import { dataProvider } from '@nocobase/app-plugin-data-provider/client';
import {
  accessControlProvider,
  AclStoreProvider,
  aclStore,
} from '@nocobase/portal-sdk/acl';
import { i18nProvider } from '@nocobase/portal-sdk/i18n';
import { getPortalBase } from '@nocobase/portal-sdk/runtime';
import { type ResourceProps } from '@refinedev/core';
import { UnsavedChangesNotifier } from '@refinedev/react-router';
import { lazy, Suspense, type PropsWithChildren } from 'react';

import { DocumentTitleHandler } from './components/app-shell/document-title-handler';
import { ThemeProvider } from './components/theme/theme-provider';
import { TooltipProvider } from './components/ui/tooltip';
import { BrandLogo } from './components/app-shell/brand';
import { configuredResources } from './app/extensions';
import { configureCrmSettings } from './app/settings';
import { appClient, authProvider } from './auth';
import './App.css';
import { SystemSettingsProvider } from './providers/system-settings/provider';
import { AppRoutes } from './app/routes';

const getResourcePriority = (resource: ResourceProps) =>
  typeof resource.meta?.priority === 'number' ? resource.meta.priority : 100;

const appResources = [...configuredResources].sort(
  (left, right) => getResourcePriority(left) - getResourcePriority(right),
);

const basename = getPortalBase().replace(/\/+$/, '');
const notificationProvider = createNotificationProvider({ undoLabel: '撤销' });
configureCrmSettings(appClient);

const ReactGrabPicker = import.meta.env.DEV
  ? lazy(() => import('./components/development/react-grab-picker'))
  : null;

function CrmAclStoreProvider({ children }: PropsWithChildren) {
  return <AclStoreProvider store={aclStore}>{children}</AclStoreProvider>;
}

function DevelopmentToolsProvider({ children }: PropsWithChildren) {
  return (
    <>
      {children}
      {ReactGrabPicker ? (
        <Suspense fallback={null}>
          <ReactGrabPicker />
        </Suspense>
      ) : null}
    </>
  );
}

const providers: readonly AppClientProvider[] = [
  ThemeProvider,
  TooltipProvider,
  SystemSettingsProvider,
  CrmAclStoreProvider,
  ...notificationProviders.map((provider) => provider.component),
  DevelopmentToolsProvider,
];

function App() {
  return (
    <AppClientRoot
      config={{
        basename,
        client: appClient,
        providers,
        refine: {
          dataProvider,
          notificationProvider,
          authProvider,
          accessControlProvider,
          i18nProvider,
          resources: appResources,
          options: {
            syncWithLocation: true,
            warnWhenUnsavedChanges: true,
            disableTelemetry: true,
            title: {
              text: 'NocoBase CRM',
              icon: <BrandLogo className='size-14 rounded-2xl' />,
            },
          },
        },
        routes: (
          <>
            <AppRoutes />
            <UnsavedChangesNotifier />
            <DocumentTitleHandler appName='NocoBase CRM' />
          </>
        ),
      }}
    />
  );
}

export default App;
