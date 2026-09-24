import type { Context } from 'hono';
import {
  AuthorizationDeniedError,
  parseAuthorizationTitle,
  type AuthorizationRouteHandler,
  type BusinessApi,
  type PermissionGrant,
  type PermissionGrantAction,
  type Principal,
  type RecordAccessRegistry,
} from '@nocobase/authorization/core';
import {
  PermissionSetConflictError,
  PermissionSetLastAssignmentError,
  PermissionSetNotFoundError,
  PermissionSetProtectedError,
  PermissionSetSubjectNotAllowedError,
  type AssignPermissionSetInput,
  type CreatePermissionSetInput,
  type PermissionSet,
  type PermissionSetProtectionInfo,
  type PermissionSetsApi,
} from '@nocobase/authorization/permission-sets';
import {
  createRouteHandler,
  createSettingsRouter,
  requireSettings,
  type SettingsRouterEnv,
} from '../extension/http.js';
import { createSubjectRoutes } from '../extension/options.js';
import type { AuthorizationExtensionHost } from '../host.js';
import { authorizationOptions } from '../options.js';

/** A Permission Set as the read endpoints report it. */
export interface PermissionSetSummary extends PermissionSet {
  /** Present when the set is protected; `allow` lists what the generic API may still do. */
  readonly protection?: PermissionSetProtectionInfo;
  /** True when holding this set grants unrestricted access. */
  readonly unrestricted?: boolean;
}

export const PERMISSION_SETS_SETTINGS = 'authorization.permission-sets';

type Api = Omit<PermissionSetsApi, 'withTransaction'>;

function errorResponse(
  error: Error,
  context: Context<SettingsRouterEnv>,
): Response {
  if (error instanceof AuthorizationDeniedError)
    return context.json({ code: 'FORBIDDEN', message: error.message }, 403);
  if (error instanceof PermissionSetProtectedError)
    return context.json(
      { code: 'PROTECTED_PERMISSION_SET', message: error.message },
      403,
    );
  if (error instanceof PermissionSetSubjectNotAllowedError)
    return context.json(
      { code: 'PERMISSION_SET_SUBJECT_NOT_ALLOWED', message: error.message },
      403,
    );
  if (error instanceof PermissionSetNotFoundError)
    return context.json(
      { code: 'PERMISSION_SET_NOT_FOUND', message: error.message },
      404,
    );
  if (error instanceof PermissionSetConflictError)
    return context.json(
      { code: 'PERMISSION_SET_CONFLICT', message: error.message },
      409,
    );
  if (error instanceof PermissionSetLastAssignmentError)
    return context.json(
      { code: 'LAST_ASSIGNMENT', message: error.message },
      409,
    );
  if (error instanceof TypeError)
    return context.json(
      { code: 'INVALID_AUTHORIZATION_INPUT', message: error.message },
      400,
    );
  throw error;
}

/** Every `/permission-sets` route, gated by `settings:authorization.permission-sets`. */
export function createPermissionSetHandler(
  host: AuthorizationExtensionHost,
  api: Api,
): AuthorizationRouteHandler {
  const routes = createSettingsRouter();
  routes.onError(errorResponse);
  const require = (context: Context<SettingsRouterEnv>, action: string) =>
    requireSettings(
      context.env.authorization,
      PERMISSION_SETS_SETTINGS,
      action,
    );

  routes.get('/permission-sets/options', async (context) => {
    await require(context, 'read');
    return context.json({ data: await authorizationOptions(host) });
  });
  routes.route(
    '/',
    createSubjectRoutes(
      host,
      '/permission-sets',
      PERMISSION_SETS_SETTINGS,
      'read',
    ).onError(errorResponse),
  );
  routes.get('/permission-sets/effective/:type/:id', async (context) => {
    await require(context, 'read');
    const principal: Principal = {
      type: context.req.param('type'),
      id: context.req.param('id'),
    };
    return context.json({
      data: (await api.getEffective({ principal })).map((set) =>
        summarize(api, set),
      ),
    });
  });
  routes.get('/permission-sets', async (context) => {
    await require(context, 'read');
    return context.json({
      data: (await api.list()).map((set) => summarize(api, set)),
    });
  });
  routes.post('/permission-sets', async (context) => {
    await require(context, 'create');
    const input = parsePermissionSetInput(await context.req.json());
    validateGrants(host, input);
    api.assertWritable(input.key, 'create');
    return context.json({ data: summarize(api, await api.create(input)) }, 201);
  });
  routes.get('/permission-sets/:key/assignments', async (context) => {
    await require(context, 'read');
    return context.json({
      data: await api.listAssignments(context.req.param('key')),
    });
  });
  routes.post('/permission-sets/:key/assignments', async (context) => {
    await require(context, 'assign');
    const key = context.req.param('key');
    const input = parseAssignmentInput(key, await context.req.json());
    api.assertWritable(key, 'assign');
    return context.json({ data: await api.assign(input) }, 201);
  });
  routes.delete('/permission-sets/:key/assignments/:id', async (context) => {
    await require(context, 'assign');
    const key = context.req.param('key');
    const id = context.req.param('id');
    const assignment = (await api.listAssignments(key)).find(
      (item) => item.id === id,
    );
    if (!assignment) return context.json({ code: 'ASSIGNMENT_NOT_FOUND' }, 404);
    api.assertWritable(key, 'revoke');
    await api.revoke(id);
    return context.body(null, 204);
  });
  routes.get('/permission-sets/:key', async (context) => {
    await require(context, 'read');
    const permissionSet = await api.get(context.req.param('key'));
    if (!permissionSet)
      return context.json(
        {
          code: 'PERMISSION_SET_NOT_FOUND',
          message: 'Permission Set not found',
        },
        404,
      );
    return context.json({ data: summarize(api, permissionSet) });
  });
  routes.put('/permission-sets/:key', async (context) => {
    await require(context, 'update');
    const key = context.req.param('key');
    const input = parsePermissionSetInput(await context.req.json());
    validateGrants(host, input);
    api.assertWritable(key, 'update');
    if (input.key !== key)
      for (const candidate of [key, input.key]) {
        const protection = api.protection(candidate);
        if (protection)
          throw new PermissionSetProtectedError(
            candidate,
            protection.owner,
            'update',
          );
      }
    return context.json({ data: summarize(api, await api.update(key, input)) });
  });
  routes.delete('/permission-sets/:key', async (context) => {
    await require(context, 'delete');
    const key = context.req.param('key');
    api.assertWritable(key, 'delete');
    await api.delete(key);
    return context.body(null, 204);
  });
  return createRouteHandler(routes);
}

function summarize(
  api: Api,
  permissionSet: PermissionSet,
): PermissionSetSummary {
  const protection = api.protection(permissionSet.key);
  return {
    ...permissionSet,
    ...(protection === undefined ? {} : { protection }),
    ...(protection?.unrestricted ? { unrestricted: true } : {}),
  };
}

/**
 * A business grant's data scope values must name record access that exists
 * and applies to the scope's collection; the business registry checks the rest.
 */
function validateGrants(
  host: { business: BusinessApi; recordAccess: RecordAccessRegistry },
  input: CreatePermissionSetInput,
): void {
  for (const grant of input.grants) {
    if (grant.resource.type !== 'business') continue;
    for (const entry of grant.actions) {
      const action = host.business.getAction(grant.resource.id, entry.action);
      if (!action)
        throw new TypeError(
          `Unknown business action: ${grant.resource.id}.${entry.action}`,
        );
      const scopes: unknown = entry.policy?.scopes;
      if (entry.policy === undefined) continue;
      if (
        entry.policy.type !== 'business' ||
        !scopes ||
        typeof scopes !== 'object' ||
        Array.isArray(scopes)
      )
        throw new TypeError('Invalid business grant policy');
      for (const [key, value] of Object.entries(scopes)) {
        const scope = action.dataScopes?.find((item) => item.key === key);
        if (!scope) throw new TypeError(`Unknown data scope: ${key}`);
        const recordAccess: unknown =
          typeof value === 'string'
            ? value
            : value &&
                typeof value === 'object' &&
                Reflect.get(value, 'type') === 'recordAccess'
              ? Reflect.get(value, 'key')
              : undefined;
        if (recordAccess === undefined) continue;
        const definition =
          typeof recordAccess === 'string'
            ? host.recordAccess.get(recordAccess)
            : undefined;
        if (
          !definition ||
          !definition.collections.some(
            (name) => name === '*' || name === scope.collection,
          ) ||
          (scope.options && !scope.options.includes(definition.key))
        )
          throw new TypeError('Unknown or inapplicable record access');
      }
    }
  }
}

function parsePermissionSetInput(value: unknown): CreatePermissionSetInput {
  const input = recordValue(value, 'Permission Set');
  const key = stringValue(input.key, 'Permission Set key');
  const title = parseAuthorizationTitle(input.title);
  if (!Array.isArray(input.grants))
    throw new TypeError('Permission Set grants must be an array');
  return {
    key,
    ...(title === undefined ? {} : { title }),
    grants: input.grants.map(parseGrant),
  };
}

function parseGrant(value: unknown): PermissionGrant {
  const grant = recordValue(value, 'Permission Grant');
  const resource = recordValue(grant.resource, 'Permission Grant resource');
  if (!Array.isArray(grant.actions))
    throw new TypeError('Permission Grant actions must be an array');
  return {
    resource: {
      type: stringValue(resource.type, 'Permission Grant resource type'),
      id: stringValue(resource.id, 'Permission Grant resource id'),
    },
    actions: grant.actions.map(parseGrantAction),
  };
}

function parseGrantAction(value: unknown): PermissionGrantAction {
  const action = recordValue(value, 'Permission Grant action');
  if (action.policy === undefined)
    return { action: stringValue(action.action, 'Permission Grant action') };
  const policy = recordValue(action.policy, 'Permission Grant action policy');
  return {
    action: stringValue(action.action, 'Permission Grant action'),
    policy: {
      ...policy,
      type: stringValue(policy.type, 'Permission Grant policy type'),
    },
  };
}

function parseAssignmentInput(
  permissionSet: string,
  value: unknown,
): AssignPermissionSetInput {
  const input = recordValue(value, 'Permission Set assignment');
  const subject = recordValue(input.subject, 'Permission Set subject');
  return {
    ...(input.id === undefined
      ? {}
      : { id: stringValue(input.id, 'Permission Set assignment id') }),
    subject: {
      type: stringValue(subject.type, 'Permission Set subject type'),
      id: stringValue(subject.id, 'Permission Set subject id'),
    },
    permissionSet,
  };
}

function recordValue(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new TypeError(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0)
    throw new TypeError(`${label} must be a non-empty string`);
  return value;
}
