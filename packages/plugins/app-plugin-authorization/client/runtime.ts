import {
  createApiClient,
  resolveAppUrl,
  type ApiClient,
} from '@nocobase/app-client';

import { AuthorizationClient } from './authorization-client.js';

let configuredApi: ApiClient | undefined;

let authorizationClient: AuthorizationClient | undefined;

export function configureAuthorizationClient(
  api: ApiClient,
): AuthorizationClient {
  configuredApi = api;
  authorizationClient = new AuthorizationClient(api);
  return authorizationClient;
}

export function getAuthorizationClient(): AuthorizationClient {
  authorizationClient ??= new AuthorizationClient(getAuthorizationApiClient());
  return authorizationClient;
}

export function getAuthorizationApiClient(): ApiClient {
  configuredApi ??= createApiClient({ baseURL: resolveAppUrl('/api') });
  return configuredApi;
}
