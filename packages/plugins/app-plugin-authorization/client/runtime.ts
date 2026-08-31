import { createAppClient, type AppClient } from '@nocobase/app-client';

import { AuthorizationClient } from './authorization-client.js';

let authorizationClient: AuthorizationClient | undefined;

export function configureAuthorizationClient(
  appClient: AppClient,
): AuthorizationClient {
  authorizationClient = new AuthorizationClient(appClient);
  return authorizationClient;
}

export function getAuthorizationClient(): AuthorizationClient {
  authorizationClient ??= new AuthorizationClient(createAppClient());
  return authorizationClient;
}
