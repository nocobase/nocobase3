import { Refine, type ResourceProps } from '@refinedev/core';
import { BrowserRouter } from 'react-router';
import routerProvider, {
  UnsavedChangesNotifier,
} from '@refinedev/react-router';
import { i18nProvider } from '@nocobase/app-portal-sdk/i18n';
import { DocumentTitleHandler } from './components/app-shell/document-title-handler';
import { useNotificationProvider } from './components/notifications/use-notification-provider';
import { Toaster } from './components/notifications/toaster';
import { ThemeProvider } from './components/theme/theme-provider';
import { TooltipProvider } from './components/ui/tooltip';
import { BrandLogo } from './components/app-shell/brand';
import { configuredResources } from './app/extensions';
import './App.css';
import { AppRoutes } from './app/routes';
import { hubAuthRuntime, getHubBrowserBase } from './features/hub/runtime';

const getResourcePriority = (resource: ResourceProps) =>
  typeof resource.meta?.priority === 'number' ? resource.meta.priority : 100;

const appResources = [...configuredResources].sort(
  (left, right) => getResourcePriority(left) - getResourcePriority(right),
);

const basename = getHubBrowserBase();

function App() {
  return (
    <BrowserRouter basename={basename || undefined}>
      <ThemeProvider>
        <TooltipProvider>
          <Refine
            notificationProvider={useNotificationProvider()}
            routerProvider={routerProvider}
            authProvider={hubAuthRuntime.authProvider}
            i18nProvider={i18nProvider}
            resources={appResources}
            options={{
              syncWithLocation: true,
              warnWhenUnsavedChanges: true,
              disableTelemetry: true,
              title: {
                text: 'NocoBase Hub',
                icon: <BrandLogo className='size-14 rounded-2xl' />,
              },
            }}
          >
            <AppRoutes />

            <Toaster />
            <UnsavedChangesNotifier />
            <DocumentTitleHandler appName='NocoBase Hub' />
          </Refine>
        </TooltipProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

export default App;
