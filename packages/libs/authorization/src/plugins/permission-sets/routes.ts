import { Hono } from 'hono';
import { AuthorizationDeniedError } from '../../core/index.js';
import { atPath } from '../internal/http.js';
import type { Principal } from '../../core/index.js';
import type {
  PermissionGrant,
  PermissionGrantAction,
  PermissionSet,
  PermissionSetSubject,
} from './model.js';
import type {
  AssignPermissionSetInput,
  CreatePermissionSetInput,
  PermissionSetHandlerInput,
  PermissionSetProtectionInfo,
  PermissionSetsApi,
} from './plugin.js';
import {
  PermissionSetConflictError,
  PermissionSetLastAssignmentError,
  PermissionSetNotFoundError,
  PermissionSetProtectedError,
  PermissionSetSubjectNotAllowedError,
} from './plugin.js';

/**
 * A Permission Set as the read endpoints report it. The extra fields come from
 * the in-code registries rather than from stored data, so they describe what
 * the running application allows rather than what was persisted.
 */
export interface PermissionSetSummary extends PermissionSet {
  /** Present when the set is protected; `allow` lists the operations the generic API still performs. */
  readonly protection?: PermissionSetProtectionInfo;
  /** True when holding this set grants unrestricted access. */
  readonly unrestricted?: boolean;
}

interface PermissionSetHandlerEnv {
  Bindings: {
    authorization: PermissionSetHandlerInput['authorization'];
  };
}

type PermissionSetAdministrationApi = Omit<
  PermissionSetsApi,
  'handler' | 'withTransaction'
>;

/** Where the plugin registers its routes, and the prefix every path below carries. */
export const PERMISSION_SETS_ROUTE_PATH = '/permission-sets';

export function createPermissionSetHandler(
  api: PermissionSetAdministrationApi,
): (input: PermissionSetHandlerInput) => Promise<Response> {
  const routes = new Hono<PermissionSetHandlerEnv>();

  routes.onError((error, context) => {
    if (error instanceof TypeError) {
      return context.json(
        { code: 'INVALID_PERMISSION_SET_INPUT', message: error.message },
        400,
      );
    }
    if (error instanceof AuthorizationDeniedError) {
      return context.json({ code: 'FORBIDDEN', message: error.message }, 403);
    }
    if (error instanceof PermissionSetNotFoundError) {
      return context.json(
        { code: 'PERMISSION_SET_NOT_FOUND', message: error.message },
        404,
      );
    }
    if (error instanceof PermissionSetConflictError) {
      return context.json(
        { code: 'PERMISSION_SET_CONFLICT', message: error.message },
        409,
      );
    }
    if (error instanceof PermissionSetLastAssignmentError) {
      return context.json(
        { code: 'LAST_ASSIGNMENT', message: error.message },
        409,
      );
    }
    if (error instanceof PermissionSetProtectedError) {
      return context.json(
        { code: 'PROTECTED_PERMISSION_SET', message: error.message },
        403,
      );
    }
    if (error instanceof PermissionSetSubjectNotAllowedError) {
      return context.json(
        { code: 'PERMISSION_SET_SUBJECT_NOT_ALLOWED', message: error.message },
        403,
      );
    }
    throw error;
  });

  routes.use('/permission-sets/*', async (context, next) => {
    await context.env.authorization.require({
      resource: { type: 'settings', id: 'authorization.permission-sets' },
      action: permissionSetAdministrationAction(context.req.method),
    });
    await next();
  });

  routes.get('/permission-sets', async (context) => {
    const sets = await api.list();
    return context.json({ data: sets.map((set) => summarize(api, set)) });
  });

  routes.post('/permission-sets', async (context) => {
    const input = parsePermissionSetInput(await context.req.json());
    api.assertWritable(input.key, 'create');
    return context.json({ data: await api.create(input) }, 201);
  });

  routes.get('/permission-sets/effective/:type/:id', async (context) => {
    const principal: Principal = {
      type: context.req.param('type'),
      id: context.req.param('id'),
    };
    return context.json({
      data: await api.getEffective({ principal }),
    });
  });

  routes.delete('/permission-sets/assignments/:id', async (context) => {
    const id = context.req.param('id');
    const assignment = (await api.listAssignments()).find(
      (item) => item.id === id,
    );
    if (assignment) api.assertWritable(assignment.permissionSet, 'revoke');
    await api.revoke(id);
    return context.body(null, 204);
  });

  routes.get('/permission-sets/:key/assignments', async (context) => {
    return context.json({
      data: await api.listAssignments(context.req.param('key')),
    });
  });

  routes.post('/permission-sets/:key/assignments', async (context) => {
    const key = context.req.param('key');
    const input = parseAssignmentInput(key, await context.req.json());
    api.assertWritable(key, 'assign');
    return context.json({ data: await api.assign(input) }, 201);
  });

  routes.get('/permission-sets/:key', async (context) => {
    const permissionSet = await api.get(context.req.param('key'));
    if (!permissionSet) {
      return context.json(
        {
          code: 'PERMISSION_SET_NOT_FOUND',
          message: 'Permission Set not found',
        },
        404,
      );
    }
    return context.json({ data: summarize(api, permissionSet) });
  });

  routes.put('/permission-sets/:key', async (context) => {
    const key = context.req.param('key');
    const input = parsePermissionSetInput(await context.req.json());
    api.assertWritable(key, 'update');
    if (input.key !== key) api.assertWritable(input.key, 'update');
    return context.json({ data: await api.update(key, input) });
  });

  routes.delete('/permission-sets/:key', async (context) => {
    const key = context.req.param('key');
    api.assertWritable(key, 'delete');
    await api.delete(key);
    return context.body(null, 204);
  });

  return (input: PermissionSetHandlerInput): Promise<Response> =>
    Promise.resolve(
      routes.fetch(atPath(input.request, input.path), {
        authorization: input.authorization,
      }),
    );
}

/**
 * Reports protection and unrestricted access next to the stored Permission
 * Set. Both fields are omitted when they do not apply, so an ordinary set is
 * reported exactly as it is stored.
 */
function summarize(
  api: PermissionSetAdministrationApi,
  permissionSet: PermissionSet,
): PermissionSetSummary {
  const protection = api.protection(permissionSet.key);
  return {
    ...permissionSet,
    ...(protection === undefined ? {} : { protection }),
    ...(api.isUnrestricted(permissionSet.key) ? { unrestricted: true } : {}),
  };
}

function permissionSetAdministrationAction(method: string): string {
  switch (method) {
    case 'GET':
      return 'read';
    case 'POST':
      return 'create';
    case 'PUT':
      return 'update';
    case 'DELETE':
      return 'delete';
    default:
      return method.toLowerCase();
  }
}

function parsePermissionSetInput(value: unknown): CreatePermissionSetInput {
  const input = recordValue(value, 'Permission Set');
  const key = stringValue(input.key, 'Permission Set key');
  const title = optionalStringValue(input.title, 'Permission Set title');
  if (!Array.isArray(input.grants)) {
    throw new TypeError('Permission Set grants must be an array');
  }
  return {
    key,
    ...(title === undefined ? {} : { title }),
    grants: input.grants.map(parseGrant),
  };
}

function parseGrant(value: unknown): PermissionGrant {
  const grant = recordValue(value, 'Permission Grant');
  const resource = recordValue(grant.resource, 'Permission Grant resource');
  if (!Array.isArray(grant.actions)) {
    throw new TypeError('Permission Grant actions must be an array');
  }
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
  if (action.policy === undefined) {
    return { action: stringValue(action.action, 'Permission Grant action') };
  }
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
  const subject = parseSubject(input.subject);
  const id = optionalStringValue(input.id, 'Permission Set assignment id');
  return {
    ...(id === undefined ? {} : { id }),
    subject,
    permissionSet,
  };
}

function parseSubject(value: unknown): PermissionSetSubject {
  const subject = recordValue(value, 'Permission Set subject');
  return {
    type: stringValue(subject.type, 'Permission Set subject type'),
    id: stringValue(subject.id, 'Permission Set subject id'),
  };
}

function recordValue(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value;
}

function optionalStringValue(
  value: unknown,
  label: string,
): string | undefined {
  return value === undefined ? undefined : stringValue(value, label);
}
