import {
  createApiClient,
  resolveAppUrl,
  type ApiClient,
} from '@nocobase/app-client';

import { AuthorizationClient } from './authorization-client.js';

let authorizationClient: AuthorizationClient | undefined;

export function configureAuthorizationClient(
  api: ApiClient,
): AuthorizationClient {
  authorizationClient = new AuthorizationClient(api);
  return authorizationClient;
}

export function getAuthorizationClient(): AuthorizationClient {
  authorizationClient ??= new AuthorizationClient(
    createApiClient({ baseURL: resolveAppUrl('/api') }),
  );
  return authorizationClient;
}
