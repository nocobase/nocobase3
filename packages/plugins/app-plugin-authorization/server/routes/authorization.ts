import type { ResourceGroup } from '@nocobase/authorization/core';
import {
  AuthorizationDeniedError,
  type AuthorizationEnv,
} from '@nocobase/authorization/core';
import type { Auth } from '@nocobase/app-plugin-authentication';
import type { DatabaseConnection } from '@nocobase/db';
import { Hono, type Context } from 'hono';
import { describeCollection } from '../database/index.js';
import {
  resolveOptionText,
  translateAuthorization,
  type OptionText,
} from '../i18n.js';
import type { AuthorizationAdministration } from '../administration.js';
import type { AppAuthorizationService } from '../tokens.js';

/** One grantable Collection: its registration, plus the fields db reports. */
interface DatabaseCollectionOption {
  group?: string;
  readonly name: string;
  readonly title?: OptionText;
  readonly description?: OptionText;
  readonly fields: readonly string[];
}

/** One option as the wire carries it: a value and the text for this request's locale. */
interface Option {
  readonly value: string;
  readonly label: string;
  readonly description?: string;
}

export function createAuthorizationRoutes(
  auth: Auth,
  authorization: AppAuthorizationService,
  administration: AuthorizationAdministration,
  connection?: DatabaseConnection,
): Hono<AuthorizationEnv> {
  const routes = new Hono<AuthorizationEnv>();
  routes.onError((error, context) => {
    if (error instanceof AuthorizationDeniedError)
      return context.json({ code: 'FORBIDDEN', message: error.message }, 403);
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

  // The application's own endpoints answer first, so a plugin mounted at
  // `/sharing-rules` cannot swallow `/sharing-rules/options`.
  routes.get('/permission-sets/options', async (context) => {
    await admin(context, 'permission-sets', 'read');
    return context.json({
      data: await permissionSetOptions(authorization, connection, context),
    });
  });
  for (const settings of [
    'default-access',
    'sharing-rules',
    'restriction-rules',
  ] as const) {
    routes.get(`/${settings}/options`, async (context) => {
      await admin(context, settings, 'read');
      return context.json({
        data: await databaseScopeRuleOptions(
          authorization,
          connection,
          context,
        ),
      });
    });
    routes.get(`/${settings}/records/:collection`, async (context) => {
      await admin(context, settings, 'read');
      return context.json({
        data: await administration.listRecords(
          decodeURIComponent(context.req.param('collection')),
        ),
      });
    });
  }

  for (const settings of [
    'permission-sets',
    'sharing-rules',
    'restriction-rules',
  ] as const) {
    routes.get(`/${settings}/subjects/:type`, async (context) => {
      await admin(context, settings, 'read');
      const selection = authorization.subjects.get(context.req.param('type'))
        ?.administration?.selection;
      if (!selection || selection.type !== 'collection')
        return context.json({ code: 'UNKNOWN_SUBJECT_TYPE' }, 404);
      const page = Number(context.req.query('page') ?? 1);
      const pageSize = Number(context.req.query('pageSize') ?? 30);
      if (
        !Number.isSafeInteger(page) ||
        page < 1 ||
        !Number.isSafeInteger(pageSize) ||
        pageSize < 1 ||
        pageSize > 100
      )
        return context.json({ code: 'INVALID_PAGINATION' }, 400);
      const data = await selection.list(
        { search: context.req.query('search'), page, pageSize },
        { authz: context.get('authz') },
      );
      return context.json({ data });
    });
    routes.post(`/${settings}/subjects/:type/resolve`, async (context) => {
      await admin(context, settings, 'read');
      const selection = authorization.subjects.get(context.req.param('type'))
        ?.administration?.selection;
      if (!selection || selection.type !== 'collection')
        return context.json({ code: 'UNKNOWN_SUBJECT_TYPE' }, 404);
      const input = await body(context);
      const ids: unknown =
        input && typeof input === 'object'
          ? Reflect.get(input, 'ids')
          : undefined;
      if (
        !Array.isArray(ids) ||
        ids.length > 100 ||
        !ids.every(
          (id): id is string => typeof id === 'string' && id.length > 0,
        )
      )
        return context.json({ code: 'INVALID_SUBJECT_IDS' }, 400);
      return context.json({
        data: await selection.resolve(ids, { authz: context.get('authz') }),
      });
    });
  }

  routes.post('/inspect/configured', async (context) => {
    await admin(context, 'permission-sets', 'read');
    const input = await body(context);
    const subject = reference(
      input && typeof input === 'object'
        ? Reflect.get(input, 'subject')
        : undefined,
    );
    if (!subject) return context.json({ code: 'INVALID_SUBJECT' }, 400);
    const sets = await authorization.permissionSets.getEffective({
      principal: subject,
      subjects:
        subject.type === 'user' ? [{ type: 'authenticated', id: '*' }] : [],
    });
    return context.json({
      data: {
        unrestricted: sets.some(
          (set) =>
            authorization.permissionSets.protection(set.key)?.unrestricted ===
            true,
        ),
        types: [
          ...new Set(
            sets.flatMap((set) =>
              set.grants
                .filter((grant) => grant.actions.length > 0)
                .map((grant) => grant.resource.type),
            ),
          ),
        ],
      },
    });
  });

  routes.post('/inspect/batch', async (context) => {
    await admin(context, 'permission-sets', 'read');
    const input = await body(context);
    const subject = reference(
      input && typeof input === 'object'
        ? Reflect.get(input, 'subject')
        : undefined,
    );
    const checks: unknown =
      input && typeof input === 'object'
        ? Reflect.get(input, 'checks')
        : undefined;
    if (
      !subject ||
      !Array.isArray(checks) ||
      checks.length === 0 ||
      checks.length > 100
    ) {
      return context.json({ code: 'INVALID_INSPECTION_BATCH' }, 400);
    }
    const requests = checks.map((check: unknown) =>
      check && typeof check === 'object'
        ? readInspectRequest({ ...check, subject })
        : undefined,
    );
    if (requests.some((request) => !request))
      return context.json({ code: 'INVALID_INSPECTION_BATCH' }, 400);
    const scope = authorization.for({
      principal: subject,
      subjects:
        subject.type === 'user' ? [{ type: 'authenticated', id: '*' }] : [],
    });
    const results = [];
    // Bound concurrent rule queries and share one request-scoped grant cache.
    for (let offset = 0; offset < requests.length; offset += 4) {
      results.push(
        ...(await Promise.all(
          requests.slice(offset, offset + 4).map(async (request) => {
            const { resource, action } = request!;
            return {
              resource,
              action,
              decision: await scope.explain({ resource, action }),
            };
          }),
        )),
      );
    }
    return context.json({ data: results });
  });

  // Why one person reaches one resource, built only on the core's explanation
  // so it knows nothing about which plugins an application installed. It
  // reveals another person's access, so it is gated like the Permission Sets it
  // is mostly explaining.
  routes.post('/inspect', async (context) => {
    await admin(context, 'permission-sets', 'read');
    const input = readInspectRequest(await body(context));
    if (!input)
      return context.json(
        {
          code: 'INVALID_BODY',
          message: 'inspect requires a subject, a resource and an action.',
        },
        400,
      );
    // The identity the request middleware builds: the principal, plus the
    // audience subject every signed-in user carries.
    const decision = await authorization
      .for({
        principal: input.subject,
        subjects:
          input.subject.type === 'user'
            ? [{ type: 'authenticated', id: '*' }]
            : [],
      })
      .explain({ resource: input.resource, action: input.action });
    // Passed through as the core gave it: reasons name the plugin they came
    // from, and conditions are not interpreted here.
    return context.json({ data: decision });
  });

  // Everything else is served by whichever Authorization plugin registered the
  // path; one this application did not install registered nothing.
  routes.all('*', async (context) => {
    const response = authorization.routes.handle({
      request: context.req.raw,
      path: mountedPath(context),
      authorization: context.get('authz'),
    });
    return response ? await response : context.notFound();
  });
  return routes;
}

/**
 * The request path with the mount removed. Only the dispatcher sees both the
 * full path and the wildcard pattern it matched, so where the application
 * mounted these routes needs no declaration anywhere.
 */
function mountedPath(context: Context<AuthorizationEnv>): string {
  const wildcard = context.req.routePath.indexOf('*');
  const mount =
    wildcard === -1
      ? ''
      : context.req.routePath.slice(0, wildcard).replace(/\/$/, '');
  return context.req.path.slice(mount.length) || '/';
}

/** What the inspector was asked: whose access, on what, doing what. */
interface InspectRequest {
  readonly subject: { type: string; id: string };
  readonly resource: { type: string; id: string };
  readonly action: string;
}

async function body(context: Context): Promise<unknown> {
  try {
    return await context.req.json();
  } catch {
    return undefined;
  }
}

/**
 * The inspect body, checked field by field. Administering settings is what lets
 * someone ask the question, not a reason to trust the shape of what they send.
 */
function readInspectRequest(value: unknown): InspectRequest | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const { subject, resource, action } = value as Record<string, unknown>;
  const [inspected, target] = [reference(subject), reference(resource)];
  if (!inspected || !target || typeof action !== 'string' || action === '')
    return undefined;
  return { subject: inspected, resource: target, action };
}

function reference(value: unknown): { type: string; id: string } | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const { type, id } = value as Record<string, unknown>;
  return typeof type === 'string' &&
    type !== '' &&
    typeof id === 'string' &&
    id !== ''
    ? { type, id }
    : undefined;
}

const crudActions = ['read', 'create', 'update', 'delete'] as const;
async function permissionSetOptions(
  authz: AppAuthorizationService,
  connection: DatabaseConnection | undefined,
  context: Context,
): Promise<object> {
  const collections = await databaseCollections(authz, connection);
  const access = [actionOption(context, 'access')];
  return {
    plugins: ['permission-sets', 'pages', 'database'],
    resourceTypes: [
      {
        value: 'page',
        groups: authz.resources.get('page')
          ? resourceGroupOptions(
              context,
              authz.getResource('page').groups.list(),
            )
          : [],
        label: translateAuthorization(
          context,
          'options.resourceTypes.page',
          'Pages',
        ),
        resources: [
          ...(authz.resources.get('page')
            ? authz
                .getResource('page')
                .items.list()
                .map((item) => ({
                  value: item.id,
                  label: resolveOptionText(context, item.title, item.id),
                  ...(item.group ? { group: item.group } : {}),
                  actions: item.actions.map((action) =>
                    actionOption(context, action),
                  ),
                }))
            : []),
        ],
        actions: access,
      },
      databaseResourceOptions(context, collections, authz),
      administrationOptions(context, authz),
    ],
    subjectTypes: subjectTypeOptions(context, authz),
    ...databaseOptions(context, authz, collections),
  };
}

async function databaseScopeRuleOptions(
  authz: AppAuthorizationService,
  connection: DatabaseConnection | undefined,
  context: Context,
): Promise<object> {
  const collections = await databaseCollections(authz, connection);
  const collection = databaseResourceOptions(context, collections, authz);
  const withoutCreate = (actions: readonly Option[]): readonly Option[] =>
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
    subjectTypes: subjectTypeOptions(context, authz),
    ...databaseOptions(context, authz, collections),
  };
}

function resourceGroupOptions(
  context: Context,
  groups: readonly ResourceGroup[],
): object[] {
  return groups.map((group) => ({
    value: group.id,
    label: resolveOptionText(context, group.title, group.id),
    ...(group.children
      ? { children: resourceGroupOptions(context, group.children) }
      : {}),
  }));
}

function administrationOptions(
  context: Context,
  authz: AppAuthorizationService,
): object {
  const settings = authz.getResource('settings');
  const resources = settings.items.list();
  return {
    value: 'settings',
    label: translateAuthorization(
      context,
      'options.resourceTypes.settings',
      'Admin settings',
    ),
    groups: resourceGroupOptions(context, settings.groups.list()),
    resources: resources.map((resource) => ({
      value: resource.id,
      ...(resource.group ? { group: resource.group } : {}),
      label: resolveOptionText(context, resource.title, resource.id),
      actions: resource.actions.map((action) => actionOption(context, action)),
    })),
    actions: [
      ...new Set(resources.flatMap((resource) => resource.actions)),
    ].map((action) => actionOption(context, action)),
  };
}

/**
 * The Collections an application can grant on: the registered ones, and only
 * those. The field pickers still read their fields from db, which owns them.
 */
async function databaseCollections(
  authz: AppAuthorizationService,
  connection: DatabaseConnection | undefined,
): Promise<readonly DatabaseCollectionOption[]> {
  if (!connection) return [];
  const described = await Promise.all(
    authz
      .getResource('database.collection')
      .items.list()
      .map(async (registration) => {
        const collection = await describeCollection(
          connection,
          registration.name,
        );
        return collection === undefined
          ? undefined
          : { ...registration, fields: collection.fields };
      }),
  );
  return described.filter((item) => item !== undefined);
}

function databaseResourceOptions(
  context: Context,
  collections: readonly DatabaseCollectionOption[],
  authz: AppAuthorizationService,
): {
  groups: object[];
  value: string;
  label: string;
  resources: readonly (Option & { actions: readonly Option[] })[];
  actions: readonly Option[];
} {
  const actions = crudActions.map((value) => actionOption(context, value));
  return {
    value: 'database.collection',
    groups: resourceGroupOptions(
      context,
      authz.getResource('database.collection').groups.list(),
    ),
    label: translateAuthorization(
      context,
      'options.resourceTypes.collection',
      'Database collections',
    ),
    resources: collections.map((collection) => ({
      value: collection.name,
      ...(collection.group ? { group: collection.group } : {}),
      label: resolveOptionText(context, collection.title, collection.name),
      ...(collection.description === undefined
        ? {}
        : {
            description: resolveOptionText(context, collection.description, ''),
          }),
      actions,
    })),
    actions,
  };
}

/** One action as this request names it; its English sentence case is the default. */
function actionOption(context: Context, value: string): Option {
  return {
    value,
    label: translateAuthorization(
      context,
      `options.actions.${value}`,
      sentenceCase(value),
    ),
  };
}

function databaseOptions(
  context: Context,
  authz: AppAuthorizationService,
  collections: readonly DatabaseCollectionOption[],
): object {
  return {
    collections: collections.map(({ name, fields }) => ({ name, fields })),
    recordAccessPolicies: authz.db.recordAccess.list().map((policy) => ({
      value: policy.key,
      label: resolveOptionText(context, policy.title, policy.key),
      ...(policy.description === undefined
        ? {}
        : {
            description: resolveOptionText(context, policy.description, ''),
          }),
    })),
  };
}

function subjectTypeOptions(
  context: Context,
  authz: AppAuthorizationService,
): readonly object[] {
  return authz.subjects.list().flatMap((type) => {
    const definition = authz.subjects.get(type)?.administration;
    if (!definition) return [];
    return [
      {
        value: type,
        label: resolveOptionText(context, definition.title, type),
        selection:
          definition.selection.type === 'fixed'
            ? { type: 'fixed', id: definition.selection.id }
            : { type: 'collection' },
      },
    ];
  });
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
    resource: { type: 'settings', id: `authorization.${resourceId}` },
    action,
  });
}

function sentenceCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
