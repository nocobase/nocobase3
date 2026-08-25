import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';

import type { Authenticator } from '@nocobase/app-portal-sdk/auth';
import { nocobaseClient } from '@nocobase/app-portal-sdk/client';
import { resolvePortalUrl } from '@nocobase/app-portal-sdk/runtime';

export function useCasSignIn(authenticator: Authenticator) {
  const [searchParams] = useSearchParams();
  const callbackError = useMemo(() => {
    if (searchParams.get('authenticator') !== authenticator.name) {
      return undefined;
    }
    const message = searchParams.get('error');
    return message ? new Error(message) : undefined;
  }, [authenticator.name, searchParams]);

  const signIn = useCallback(() => {
    const redirect = resolvePortalUrl(
      searchParams.get('to') || searchParams.get('redirect') || '/',
    );
    const url = nocobaseClient.buildUrl('cas:login', {
      authenticator: authenticator.name,
      __appName: nocobaseClient.getAppName(),
      redirect,
    });
    window.location.replace(url.toString());
  }, [authenticator.name, searchParams]);

  return { signIn, error: callbackError };
}
