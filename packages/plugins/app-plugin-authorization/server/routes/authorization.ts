import {
  AuthorizationDeniedError,
  type AuthorizationEnv,
} from '@nocobase/authorization/core';
import type { SharingRule } from '@nocobase/authorization/sharing-rules';
import type { RestrictionRule } from '@nocobase/authorization/restriction-rules';
import type { Auth } from '@nocobase/app-plugin-authentication';
import { Hono } from 'hono';
import type { AppAuthorization } from '../authorization.js';
import {
  PermissionSetConflictError,
  PermissionSetLastAssignmentError,
  PermissionSetNotFoundError,
} from '@nocobase/authorization/permissions';

export function createAuthorizationRoutes(
  auth: Auth,
  authorization: AppAuthorization,
): Hono<AuthorizationEnv> {
  const routes = new Hono<AuthorizationEnv>();
  routes.onError((error, context) => {
    if (error instanceof AuthorizationDeniedError)
      return context.json({ code: 'FORBIDDEN', message: error.message }, 403);
    if (error instanceof TypeError)
      return context.json(
        { code: 'INVALID_AUTHORIZATION_INPUT', message: error.message },
        400,
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
    throw error;
  });
  routes.use('*', auth.required());
  routes.use('*', authorization.middleware());
  routes.get('/permissions', (context) =>
    authorization.permissions.handler({
      request: context.req.raw,
      authorization: context.get('authz'),
    }),
  );
  routes.get('/permission-sets/options', async (context) => {
    await admin(context, 'permission-sets', 'read');
    return context.json({ data: permissionSetOptions(authorization) });
  });
  routes.get('/permission-sets/users', async (context) => {
    await admin(context, 'permission-sets', 'read');
    return context.json({
      data: await authorization.administration.listUsers(),
    });
  });
  // Every other Permission Set operation goes through the library handler,
  // which also enforces protected Permission Sets registered by plugins.
  routes.on(
    ['GET', 'POST', 'PUT', 'DELETE'],
    ['/permission-sets', '/permission-sets/*'],
    (context) =>
      authorization.permissionSets.handler({
        request: context.req.raw,
        authorization: context.get('authz'),
        basePath: '/api/authz',
      }),
  );

  routes.get('/default-access', async (context) => {
    await admin(context, 'default-access', 'read');
    return context.json({ data: await authorization.defaultAccess.list() });
  });
  routes.put('/default-access', async (context) => {
    const rule = parseDefault(await context.req.json());
    const existing = await authorization.defaultAccess.get(
      rule.resource.type,
      rule.resource.id,
    );
    await admin(context, 'default-access', existing ? 'update' : 'create');
    return context.json({
      data: await authorization.defaultAccess.set(rule),
    });
  });
  routes.delete('/default-access/:type/:id', async (context) => {
    await admin(context, 'default-access', 'delete');
    await authorization.defaultAccess.delete(
      context.req.param('type'),
      context.req.param('id'),
    );
    return context.body(null, 204);
  });
  routes.get('/sharing-rules', async (context) => {
    await admin(context, 'sharing-rules', 'read');
    return context.json({ data: await authorization.sharingRules.list() });
  });
  routes.post('/sharing-rules', async (context) => {
    await admin(context, 'sharing-rules', 'create');
    return context.json(
      {
        data: await authorization.sharingRules.create(
          parseRule(await context.req.json(), 'sharing'),
        ),
      },
      201,
    );
  });
  routes.put('/sharing-rules/:key', async (context) => {
    await admin(context, 'sharing-rules', 'update');
    return context.json({
      data: await authorization.sharingRules.update(
        context.req.param('key'),
        parseRule(await context.req.json(), 'sharing'),
      ),
    });
  });
  routes.delete('/sharing-rules/:key', async (context) => {
    await admin(context, 'sharing-rules', 'delete');
    await authorization.sharingRules.delete(context.req.param('key'));
    return context.body(null, 204);
  });
  routes.get('/restriction-rules', async (context) => {
    await admin(context, 'restriction-rules', 'read');
    return context.json({
      data: await authorization.restrictionRules.list(),
    });
  });
  routes.post('/restriction-rules', async (context) => {
    await admin(context, 'restriction-rules', 'create');
    return context.json(
      {
        data: await authorization.restrictionRules.create(
          parseRule(await context.req.json(), 'restriction'),
        ),
      },
      201,
    );
  });
  routes.put('/restriction-rules/:key', async (context) => {
    await admin(context, 'restriction-rules', 'update');
    return context.json({
      data: await authorization.restrictionRules.update(
        context.req.param('key'),
        parseRule(await context.req.json(), 'restriction'),
      ),
    });
  });
  routes.delete('/restriction-rules/:key', async (context) => {
    await admin(context, 'restriction-rules', 'delete');
    await authorization.restrictionRules.delete(context.req.param('key'));
    return context.body(null, 204);
  });
  routes.get('/default-access/options', async (context) => {
    await admin(context, 'default-access', 'read');
    return context.json({ data: databaseScopeRuleOptions(authorization) });
  });
  routes.get('/default-access/records/:collection', async (context) => {
    await admin(context, 'default-access', 'read');
    return context.json({
      data: await authorization.administration.listRecords(
        decodeURIComponent(context.req.param('collection')),
      ),
    });
  });
  routes.get('/sharing-rules/options', async (context) => {
    await admin(context, 'sharing-rules', 'read');
    return context.json({ data: databaseScopeRuleOptions(authorization) });
  });
  routes.get('/sharing-rules/users', async (context) => {
    await admin(context, 'sharing-rules', 'read');
    return context.json({
      data: await authorization.administration.listUsers(),
    });
  });
  routes.get('/sharing-rules/records/:collection', async (context) => {
    await admin(context, 'sharing-rules', 'read');
    return context.json({
      data: await authorization.administration.listRecords(
        decodeURIComponent(context.req.param('collection')),
      ),
    });
  });
  routes.get('/restriction-rules/options', async (context) => {
    await admin(context, 'restriction-rules', 'read');
    return context.json({ data: databaseScopeRuleOptions(authorization) });
  });
  routes.get('/restriction-rules/users', async (context) => {
    await admin(context, 'restriction-rules', 'read');
    return context.json({
      data: await authorization.administration.listUsers(),
    });
  });
  routes.get('/restriction-rules/records/:collection', async (context) => {
    await admin(context, 'restriction-rules', 'read');
    return context.json({
      data: await authorization.administration.listRecords(
        decodeURIComponent(context.req.param('collection')),
      ),
    });
  });
  return routes;
}

const crudActions = ['read', 'create', 'update', 'delete'] as const;
const administrationResources = [
  settingsResource('permission-sets', crudActions),
  settingsResource('default-access', crudActions),
  settingsResource('sharing-rules', crudActions),
  settingsResource('restriction-rules', crudActions),
] as const;

function permissionSetOptions(authz: AppAuthorization): object {
  return {
    plugins: ['permission-sets', 'pages', 'database'],
    resourceTypes: [
      {
        value: 'page',
        label: 'Pages',
        resources: [
          // The page inventory is declared in client route files, which the server never sees. The browser merges the
          // grantable pages into these options from its own route registry; only the wildcard is meaningful without
          // knowing the inventory.
          {
            value: '*',
            label: 'All pages',
            description:
              'Allow access to every page, including pages added later.',
            actions: [{ value: 'access', label: 'Access' }],
          },
        ],
        actions: [{ value: 'access', label: 'Access' }],
      },
      administrationOptions(),
      databaseResourceOptions(authz),
    ],
    subjectTypes: subjectTypeOptions(),
    ...databaseOptions(authz),
  };
}

function databaseScopeRuleOptions(authz: AppAuthorization): object {
  const collection = databaseResourceOptions(authz);
  const withoutCreate = (
    actions: readonly { value: string; label: string }[],
  ): readonly { value: string; label: string }[] =>
    actions.filter((action) => action.value !== 'create');
  return {
    plugins: ['database'],
    resourceTypes: [
      {
        ...collection,
        resources: collection.resources.map((resource) => ({
          ...resource,
          actions: withoutCreate(resource.actions),
        })),
        actions: withoutCreate(collection.actions),
      },
    ],
    subjectTypes: subjectTypeOptions(),
    ...databaseOptions(authz),
  };
}

function administrationOptions(): object {
  return {
    value: 'authorization.settings',
    label: 'Authorization settings',
    resources: administrationResources,
    actions: ['read', 'create', 'update', 'delete'].map((value) => ({
      value,
      label: sentenceCase(value),
    })),
  };
}

function databaseResourceOptions(authz: AppAuthorization): {
  value: string;
  label: string;
  resources: readonly {
    value: string;
    label: string;
    description?: string;
    actions: readonly { value: string; label: string }[];
  }[];
  actions: readonly { value: string; label: string }[];
} {
  const collections = authz.database.collections.list();
  return {
    value: 'database.collection',
    label: 'Database collections',
    resources: collections.map((collection) => ({
      value: collection.name,
      label: collection.title ?? collection.name,
      description: collection.description,
      actions: collection.actions.map((value) => ({
        value,
        label: sentenceCase(value),
      })),
    })),
    actions: unique(
      collections.flatMap((collection) => collection.actions),
    ).map((value) => ({ value, label: sentenceCase(value) })),
  };
}

function settingsResource(
  value: string,
  actions: readonly string[],
): {
  value: string;
  label: string;
  actions: readonly { value: string; label: string }[];
} {
  return {
    value,
    label: title(value),
    actions: actions.map((action) => ({
      value: action,
      label: sentenceCase(action),
    })),
  };
}

function databaseOptions(authz: AppAuthorization): object {
  return {
    collections: authz.database.collections.list(),
    recordAccessPolicies: authz.database.recordAccess.list().map((policy) => ({
      value: policy.key,
      label: policy.title ?? policy.key,
      description: policy.description,
    })),
  };
}

function subjectTypeOptions(): readonly object[] {
  return [
    {
      value: 'authenticated',
      label: 'All signed-in users',
      description: 'Applies to every user with a valid signed-in session.',
    },
    { value: 'user', label: 'Specific user' },
  ];
}

function title(value: string): string {
  return value.split('-').map(sentenceCase).join(' ');
}

async function admin(
  context: {
    get(name: 'authz'): {
      require(input: {
        resource: { type: string; id: string };
        action: string;
      }): Promise<void>;
    };
  },
  resourceId: string,
  action: string,
): Promise<void> {
  await context.get('authz').require({
    resource: { type: 'authorization.settings', id: resourceId },
    action,
  });
}
function parseDefault(value: unknown): {
  resource: { type: string; id: string };
  actions: readonly {
    action: string;
    scope: { type: string; [key: string]: unknown };
  }[];
} {
  const input = object(value, 'Default Access Rule');
  return {
    resource: resource(input.resource),
    actions: actionScopes(input.actions),
  };
}
function parseRule(value: unknown, kind: 'sharing'): SharingRule;
function parseRule(value: unknown, kind: 'restriction'): RestrictionRule;
function parseRule(
  value: unknown,
  kind: 'sharing' | 'restriction',
): SharingRule | RestrictionRule {
  const input = object(value, `${kind} rule`);
  const base = {
    key: string(input.key, 'key'),
    ...(input.title ? { title: string(input.title, 'title') } : {}),
    resource: resource(input.resource),
    subjects: subjects(input.subjects),
    ...(input.reason ? { reason: string(input.reason, 'reason') } : {}),
  };
  if (kind === 'restriction')
    return { ...base, actions: actionScopes(input.actions) };
  return { ...base, actions: sharingActions(input.actions) };
}

function actionScopes(value: unknown): readonly {
  action: string;
  scope: { type: string; [key: string]: unknown };
}[] {
  if (!Array.isArray(value)) throw new TypeError('actions must be an array');
  return value.map((entry) => {
    const item = object(entry, 'action');
    return { action: string(item.action, 'action'), scope: scope(item.scope) };
  });
}

function sharingActions(value: unknown): SharingRule['actions'] {
  if (!Array.isArray(value)) throw new TypeError('actions must be an array');
  return value.map((entry) => {
    const item = object(entry, 'action');
    const selection = object(item.selection, 'selection');
    if (selection.type !== 'records' && selection.type !== 'policy') {
      throw new TypeError('selection type must be records or policy');
    }
    const policy =
      selection.type === 'policy' ? scope(selection.policy) : undefined;
    if (policy?.type === 'ids') {
      throw new TypeError(
        'Sharing policy cannot use specific IDs; use records selection instead',
      );
    }
    return {
      action: string(item.action, 'action'),
      selection:
        selection.type === 'records'
          ? { type: 'records', ids: strings(selection.ids, 'ids') }
          : {
              type: 'policy',
              policy: policy!,
            },
    };
  });
}
function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError(`${label} must be an object`);
  return value as Record<string, unknown>;
}
function string(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim())
    throw new TypeError(`${label} must be a non-empty string`);
  return value.trim();
}
function strings(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  return value.map((item) => string(item, label));
}
function resource(value: unknown): { type: string; id: string } {
  const item = object(value, 'resource');
  return {
    type: string(item.type, 'resource type'),
    id: string(item.id, 'resource id'),
  };
}
function subjects(value: unknown): readonly { type: string; id: string }[] {
  if (!Array.isArray(value)) throw new TypeError('subjects must be an array');
  return value.map((item) => {
    const subject = object(item, 'subject');
    return {
      type: string(subject.type, 'subject type'),
      id: string(subject.id, 'subject id'),
    };
  });
}
function scope(value: unknown): { type: string; [key: string]: unknown } {
  const item = object(value, 'scope');
  const type = string(item.type, 'scope type');
  if (type === 'all') return { type };
  if (type === 'ids') return { type, ids: strings(item.ids, 'scope ids') };
  if (type === 'database')
    return {
      type,
      recordAccess:
        typeof item.recordAccess === 'string'
          ? item.recordAccess
          : object(item.recordAccess, 'recordAccess'),
    };
  throw new TypeError(`Unknown scope type: ${type}`);
}
function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort();
}
function sentenceCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
