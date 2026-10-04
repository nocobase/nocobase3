import { Hono, type MiddlewareHandler } from 'hono';
import { createMiddleware } from 'hono/factory';
import {
  ApiError,
  apiErrorResponse,
  apiErrorHandler,
} from '@nocobase/app-server/router';
import type {
  AuthorizationContext,
  AuthorizationRouteHandler,
} from '@nocobase/authorization/core';
import {
  PermissionSetConflictError,
  PermissionSetLastAssignmentError,
  PermissionSetNotFoundError,
  PermissionSetProtectedError,
  PermissionSetSubjectNotAllowedError,
} from '@nocobase/authorization/permission-sets';

export interface SettingsRouterEnv {
  Bindings: {
    authorization: AuthorizationContext;
  };
}

/** The domain of every error the authorization plugin and its rule plugins report. */
export const AUTHORIZATION_ERROR_DOMAIN = 'authorization';

/** Turns an error a settings router recognizes into the standard API error, or `undefined` for one it does not. */
export type AuthorizationErrorTranslator = (
  error: unknown,
) => ApiError | undefined;

/**
 * The standard API error for a domain error every authorization settings surface can raise, or `undefined` for anything
 * else: the Permission Set errors, and the authorization library's validation errors.
 *
 * The library validates grants, rules, titles and record selections as it stores them and reports a rejected one as a
 * `TypeError`. Inside a settings router that is the administrator's input, so it answers `400 INVALID_ARGUMENT` with
 * reason `INVALID_AUTHORIZATION_INPUT`.
 */
export function toAuthorizationApiError(error: unknown): ApiError | undefined {
  const known = knownError(error);
  if (!known) return undefined;
  return new ApiError({
    ...known,
    domain: AUTHORIZATION_ERROR_DOMAIN,
    message: (error as Error).message,
    cause: error,
  });
}

function knownError(
  error: unknown,
):
  | Pick<ConstructorParameters<typeof ApiError>[0], 'status' | 'reason'>
  | undefined {
  if (error instanceof PermissionSetNotFoundError)
    return { status: 'NOT_FOUND', reason: 'PERMISSION_SET_NOT_FOUND' };
  if (error instanceof PermissionSetProtectedError)
    return {
      status: 'FAILED_PRECONDITION',
      reason: 'PROTECTED_PERMISSION_SET',
    };
  if (error instanceof PermissionSetSubjectNotAllowedError)
    return {
      status: 'INVALID_ARGUMENT',
      reason: 'PERMISSION_SET_SUBJECT_NOT_ALLOWED',
    };
  if (error instanceof PermissionSetConflictError)
    return { status: 'ALREADY_EXISTS', reason: 'PERMISSION_SET_CONFLICT' };
  if (error instanceof PermissionSetLastAssignmentError)
    return { status: 'FAILED_PRECONDITION', reason: 'LAST_ASSIGNMENT' };
  if (error instanceof TypeError)
    return {
      status: 'INVALID_ARGUMENT',
      reason: 'INVALID_AUTHORIZATION_INPUT',
    };
  return undefined;
}

/**
 * A router for one authorization settings surface. The domain errors `translate` recognizes, then those
 * `toAuthorizationApiError` recognizes, answer in the standard API error body; anything else goes to the framework,
 * which renders what it recognizes, such as a denial or invalid input, and rethrows the rest.
 */
export function createSettingsRouter(
  translate?: AuthorizationErrorTranslator,
): Hono<SettingsRouterEnv> {
  const routes = new Hono<SettingsRouterEnv>();
  routes.onError((error, context) => {
    const own = translate?.(error) ?? toAuthorizationApiError(error);
    return own
      ? apiErrorResponse(context, own)
      : apiErrorHandler(error, context);
  });
  return routes;
}

/**
 * `requireSettings` as route middleware. Register it before a route's validators, so a caller without the permission
 * gets `403` whatever the request holds, and learns nothing about what a valid request looks like.
 */
export function settingsAccess(
  id: string,
  action: string,
): MiddlewareHandler<SettingsRouterEnv> {
  return createMiddleware<SettingsRouterEnv>(async (context, next) => {
    await requireSettings(context.env.authorization, id, action);
    await next();
  });
}

/** The one settings check: `settings:<id>` `<action>`, or `AuthorizationDeniedError`. */
export function requireSettings(
  authorization: AuthorizationContext,
  id: string,
  action: string,
): Promise<void> {
  return authorization.require({
    resource: { type: 'settings', id },
    action,
  });
}

/** Adapts a settings router to `authz.routes.add`. */
export function createRouteHandler(
  routes: Hono<SettingsRouterEnv>,
): AuthorizationRouteHandler {
  return (input) =>
    Promise.resolve(
      routes.fetch(atPath(input.request, input.path), {
        authorization: input.authorization,
      }),
    );
}

/** The request as the router sees it: at the dispatcher-relative path. */
function atPath(request: Request, path: string): Request {
  const url = new URL(request.url);
  if (url.pathname === path) return request;
  url.pathname = path;
  return new Request(url, {
    method: request.method,
    headers: request.headers,
    ...(request.body ? { body: request.body, duplex: 'half' } : {}),
  });
}
