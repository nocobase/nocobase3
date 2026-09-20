import { useService } from '@nocobase/app-client';
import type { AuthorizationClient } from './authorization-client.js';
import { authorizationClientToken } from './tokens.js';

export function useAuthorizationClient(): AuthorizationClient {
  return useService(authorizationClientToken);
}
