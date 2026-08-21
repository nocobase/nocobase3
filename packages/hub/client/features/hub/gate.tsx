import { useTranslate } from '@refinedev/core';
import { useEffect, useState, type PropsWithChildren } from 'react';
import { Navigate, useLocation } from 'react-router';

import { HubErrorState, HubLoadingState } from './components';
import {
  HubApiError,
  hubGet,
  setHubUnauthorizedHandler,
  type HubFetcher,
  type HubMe,
} from './api';
import { hubAuthRuntime, type HubAuthRuntime } from './runtime';

export interface HubAuthGateProps extends PropsWithChildren {
  runtime?: HubAuthRuntime;
  fetcher?: HubFetcher;
  publicPaths?: string[];
}

interface SetupStatus {
  setupRequired: boolean;
  ownerConfigured: boolean;
}

/**
 * Owns only the Hub session boundary. It deliberately does not call the
 * Portal SDK runtime or an external NocoBase API.
 */
export function HubAuthGate({
  children,
  runtime = hubAuthRuntime,
  fetcher,
  publicPaths = ['/login', '/signin', '/setup'],
}: HubAuthGateProps) {
  const translate = useTranslate();
  const location = useLocation();
  const [state, setState] = useState<
    | { status: 'loading' }
    | {
        status: 'ready';
        authenticated: boolean;
        setupRequired: boolean;
        checkedPath: string;
      }
    | { status: 'error'; error: Error }
  >({ status: 'loading' });
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    setHubUnauthorizedHandler(() => {
      void runtime.authProvider.onError?.(
        new HubApiError('Hub session expired.', {
          code: 'UNAUTHORIZED',
          status: 401,
        }),
      );
      setState({
        status: 'ready',
        authenticated: false,
        setupRequired: false,
        checkedPath: location.pathname,
      });
      setRevision((value) => value + 1);
    });
    return () => setHubUnauthorizedHandler(undefined);
  }, [location.pathname, runtime]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      runtime.authProvider.check(),
      hubGet<SetupStatus>('/setup/status', fetcher),
    ])
      .then(([auth, setup]) => {
        if (cancelled) return;
        setState({
          status: 'ready',
          authenticated: auth.authenticated,
          setupRequired: setup.data.setupRequired,
          checkedPath: location.pathname,
        });
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setState({
          status: 'error',
          error: reason instanceof Error ? reason : new Error(String(reason)),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [fetcher, location.pathname, revision, runtime]);

  if (state.status === 'loading') {
    return (
      <HubLoadingState label={translate('hub.start.loading', 'Loading Hub')} />
    );
  }
  if (state.status === 'error') {
    return (
      <div className='mx-auto flex min-h-svh max-w-xl items-center px-6'>
        <HubErrorState
          error={state.error}
          onRetry={() => {
            setState({ status: 'loading' });
            setRevision((value) => value + 1);
          }}
          title={translate('hub.start.error', 'Unable to start Hub')}
        />
      </div>
    );
  }
  if (state.checkedPath !== location.pathname) {
    return (
      <HubLoadingState label={translate('hub.start.loading', 'Loading Hub')} />
    );
  }

  const isPublic = publicPaths.some(
    (path) =>
      location.pathname === path || location.pathname.startsWith(`${path}/`),
  );
  if (state.setupRequired && location.pathname !== '/setup') {
    return <Navigate to='/setup' replace state={{ from: location }} />;
  }
  if (!state.setupRequired && location.pathname === '/setup') {
    const locationState: unknown = location.state;
    return (
      <Navigate
        to={state.authenticated ? '/' : '/login'}
        replace
        state={locationState}
      />
    );
  }
  if (!state.authenticated && !isPublic) {
    return <Navigate to='/login' replace state={{ from: location }} />;
  }
  if (state.authenticated && location.pathname === '/login') {
    return <Navigate to='/' replace />;
  }
  return <>{children}</>;
}

/** A compact session-aware capability read for pages that do not need a gate. */
export async function readHubMe(fetcher?: HubFetcher): Promise<HubMe> {
  return (await hubGet<HubMe>('/me', fetcher)).data;
}
