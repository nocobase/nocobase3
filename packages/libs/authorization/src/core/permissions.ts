import type { AuthorizationScope } from './authorization.js';
import type { ResourceRef } from './types.js';

export interface AuthorizationPermission {
  resource: ResourceRef;
  actions: readonly string[];
}

export interface AuthorizationPermissionsSnapshot {
  permissions: readonly AuthorizationPermission[];
}

export interface AuthorizationPermissionsHandlerInput {
  request: Request;
  authorization: Pick<AuthorizationScope, 'permissions'>;
}

export interface AuthorizationPermissionsApi {
  handler(input: AuthorizationPermissionsHandlerInput): Promise<Response>;
}

export function createAuthorizationPermissionsApi(): AuthorizationPermissionsApi {
  return {
    async handler(input): Promise<Response> {
      if (input.request.method !== 'GET') {
        return Response.json(
          {
            code: 'METHOD_NOT_ALLOWED',
            message: 'Authorization permissions only supports GET',
          },
          { status: 405, headers: { allow: 'GET' } },
        );
      }
      return Response.json({ data: await input.authorization.permissions() });
    },
  };
}
