import { Hono } from 'hono';
import { AuthorizationDeniedError } from '../../core/index.js';
import type { Principal } from '../../core/index.js';
import type {
  PermissionGrant,
  PermissionGrantAction,
  PermissionSetSubject,
} from './model.js';
import type {
  AssignPermissionSetInput,
  CreatePermissionSetInput,
  PermissionSetHandlerInput,
  PermissionSetsApi,
} from './plugin.js';
import {
  PermissionSetConflictError,
  PermissionSetNotFoundError,
} from './plugin.js';

interface PermissionSetHandlerEnv {
  Bindings: {
    authorization: PermissionSetHandlerInput['authorization'];
  };
}

type PermissionSetAdministrationApi = Omit<PermissionSetsApi, 'handler'>;

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
    throw error;
  });

  routes.use('/permission-sets/*', async (context, next) => {
    await context.env.authorization.require({
      resource: { type: 'authorization.permission-sets', id: '*' },
      action: permissionSetAdministrationAction(context.req.method),
    });
    await next();
  });

  routes.get('/permission-sets', async (context) => {
    return context.json({ data: await api.list() });
  });

  routes.post('/permission-sets', async (context) => {
    const input = parsePermissionSetInput(await context.req.json());
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
    await api.revoke(context.req.param('id'));
    return context.body(null, 204);
  });

  routes.get('/permission-sets/:key/assignments', async (context) => {
    return context.json({
      data: await api.listAssignments(context.req.param('key')),
    });
  });

  routes.post('/permission-sets/:key/assignments', async (context) => {
    const input = parseAssignmentInput(
      context.req.param('key'),
      await context.req.json(),
    );
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
    return context.json({ data: permissionSet });
  });

  routes.put('/permission-sets/:key', async (context) => {
    const input = parsePermissionSetInput(await context.req.json());
    return context.json({
      data: await api.update(context.req.param('key'), input),
    });
  });

  routes.delete('/permission-sets/:key', async (context) => {
    await api.delete(context.req.param('key'));
    return context.body(null, 204);
  });

  return (input: PermissionSetHandlerInput): Promise<Response> =>
    Promise.resolve(
      routes.fetch(withoutBasePath(input.request, input.basePath), {
        authorization: input.authorization,
      }),
    );
}

function withoutBasePath(request: Request, basePath?: string): Request {
  if (!basePath) return request;
  const url = new URL(request.url);
  const normalized = `/${basePath}`.replace(/\/+/g, '/').replace(/\/$/, '');
  if (
    url.pathname !== normalized &&
    !url.pathname.startsWith(`${normalized}/`)
  ) {
    return request;
  }
  url.pathname = url.pathname.slice(normalized.length) || '/';
  return new Request(url, request);
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
