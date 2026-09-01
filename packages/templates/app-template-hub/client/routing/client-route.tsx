import type {
  AppClientRegisteredRoute,
  AppClientRouteComponentModule,
} from '@nocobase/app-client/plugins';
import { NamespaceScope } from '@nocobase/i18n/client';
import { useCan } from '@refinedev/core';
import { type ReactElement, useEffect, useState } from 'react';
import { ErrorBoundary } from 'react-error-boundary';

import { Loading } from '@/components/loading';
import { Button } from '@/components/ui/button';

import { describeRoutePage, type ClientPageDescriptor } from './client-page.js';

export interface ClientRouteProps {
  readonly route: AppClientRegisteredRoute;
}

export function ClientRoute({ route }: ClientRouteProps): ReactElement {
  return <ClientPage page={describeRoutePage(route)} />;
}

export interface ClientPageProps {
  readonly page: ClientPageDescriptor;
}

export function ClientPage({ page }: ClientPageProps): ReactElement {
  const { access, checkAccess, componentLoader } = page;
  const { data: accessResult, isLoading: accessLoading } = useCan({
    resource: access.resource,
    action: access.action,
    queryOptions: {
      enabled: checkAccess,
      staleTime: 0,
      refetchOnMount: 'always',
    },
  });
  const [componentModule, setComponentModule] =
    useState<AppClientRouteComponentModule>();
  const [loadError, setLoadError] = useState<unknown>();

  useEffect(() => {
    if (checkAccess && accessResult?.can !== true) return;
    let active = true;

    componentLoader().then(
      (module) => {
        if (active) {
          setComponentModule(module);
        }
      },
      (error: unknown) => {
        if (active) {
          setLoadError(error);
        }
      },
    );

    return () => {
      active = false;
    };
  }, [accessResult?.can, checkAccess, componentLoader]);

  if (loadError) {
    return <ClientPageError page={page} />;
  }

  if (checkAccess && accessLoading) return <ClientPageLoading />;
  if (checkAccess && accessResult?.can === false)
    return <ClientPageDenied page={page} />;

  if (!componentModule) {
    return <ClientPageLoading />;
  }

  const Component = componentModule.default;

  return (
    <ErrorBoundary fallback={<ClientPageError page={page} />}>
      {/* The owning package is the page's namespace, so a plugin page translates with a bare useTranslation(). */}
      <NamespaceScope ns={page.packageName}>
        <Component />
      </NamespaceScope>
    </ErrorBoundary>
  );
}

function ClientPageDenied({ page }: ClientPageProps): ReactElement {
  return (
    <section className='grid min-h-[calc(100svh-4rem)] place-items-center px-6'>
      <section className='w-full max-w-lg space-y-3 text-center'>
        <h1 className='text-xl font-semibold'>Access denied</h1>
        <p className='text-sm text-muted-foreground'>
          You do not have permission to access {page.label}.
        </p>
      </section>
    </section>
  );
}

function ClientPageLoading(): ReactElement {
  return <Loading className='min-h-[calc(100svh-4rem)]' label='Loading page' />;
}

function ClientPageError({ page }: ClientPageProps): ReactElement {
  return (
    <section className='grid min-h-[calc(100svh-4rem)] place-items-center px-6'>
      <section className='w-full max-w-lg space-y-4 text-center'>
        <h1 className='text-xl font-semibold'>Unable to load page</h1>
        <p className='text-sm text-muted-foreground'>
          {page.kind === 'setting' ? 'Setting' : 'Route'} {page.label} from{' '}
          {page.packageName} could not be loaded.
        </p>
        <Button onClick={() => window.location.reload()}>Retry</Button>
      </section>
    </section>
  );
}
