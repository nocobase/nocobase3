import type {
  AppClientRegisteredRoute,
  AppClientRouteComponentModule,
} from '@nocobase/app-client/plugins';
import { type ReactElement, useEffect, useState } from 'react';
import { ErrorBoundary } from 'react-error-boundary';

import { Loading } from '@/components/loading';
import { Button } from '@/components/ui/button';

export interface ClientRouteProps {
  readonly route: AppClientRegisteredRoute;
}

export function ClientRoute({ route }: ClientRouteProps): ReactElement {
  const [componentModule, setComponentModule] =
    useState<AppClientRouteComponentModule>();
  const [loadError, setLoadError] = useState<unknown>();

  useEffect(() => {
    let active = true;

    route.componentLoader().then(
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
  }, [route]);

  if (loadError) {
    return <ClientRouteError route={route} />;
  }

  if (!componentModule) {
    return <ClientRouteLoading />;
  }

  const Component = componentModule.default;

  return (
    <ErrorBoundary fallback={<ClientRouteError route={route} />}>
      <Component />
    </ErrorBoundary>
  );
}

function ClientRouteLoading(): ReactElement {
  return <Loading className='min-h-[calc(100svh-4rem)]' label='Loading page' />;
}

function ClientRouteError({ route }: ClientRouteProps): ReactElement {
  return (
    <section className='grid min-h-[calc(100svh-4rem)] place-items-center px-6'>
      <section className='w-full max-w-lg space-y-4 text-center'>
        <h1 className='text-xl font-semibold'>Unable to load page</h1>
        <p className='text-sm text-muted-foreground'>
          Route {route.name} from {route.packageName} could not be loaded.
        </p>
        <Button onClick={() => window.location.reload()}>Retry</Button>
      </section>
    </section>
  );
}
