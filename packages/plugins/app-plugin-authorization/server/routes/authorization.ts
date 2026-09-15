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
        subjects: [{ type: 'authenticated', id: '*' }],
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
const administrationResources = [
  'permission-sets',
  'default-access',
  'sharing-rules',
  'restriction-rules',
] as const;

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
        label: translateAuthorization(
          context,
          'options.resourceTypes.page',
          'Pages',
        ),
        resources: [
          // The page inventory is declared in client route files, which the server never sees. The browser merges the
          // grantable pages into these options from its own route registry; only the wildcard is meaningful without
          // knowing the inventory.
          {
            value: '*',
            label: translateAuthorization(
              context,
              'options.pages.all',
              'All pages',
            ),
            description: translateAuthorization(
              context,
              'options.pages.allDescription',
              'Allow access to every page, including pages added later.',
            ),
            actions: access,
          },
        ],
        actions: access,
      },
      administrationOptions(context),
      databaseResourceOptions(context, collections),
    ],
    subjectTypes: subjectTypeOptions(context),
    ...databaseOptions(context, authz, collections),
  };
}

async function databaseScopeRuleOptions(
  authz: AppAuthorizationService,
  connection: DatabaseConnection | undefined,
  context: Context,
): Promise<object> {
  const collections = await databaseCollections(authz, connection);
  const collection = databaseResourceOptions(context, collections);
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
    subjectTypes: subjectTypeOptions(context),
    ...databaseOptions(context, authz, collections),
  };
}

function administrationOptions(context: Context): object {
  return {
    value: 'authorization.settings',
    label: translateAuthorization(
      context,
      'options.resourceTypes.settings',
      'Authorization settings',
    ),
    resources: administrationResources.map((resource) =>
      settingsResource(context, resource, crudActions),
    ),
    actions: crudActions.map((value) => actionOption(context, value)),
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
    authz.db.collections.list().map(async (registration) => {
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
): {
  value: string;
  label: string;
  resources: readonly (Option & { actions: readonly Option[] })[];
  actions: readonly Option[];
} {
  const actions = crudActions.map((value) => actionOption(context, value));
  return {
    value: 'database.collection',
    label: translateAuthorization(
      context,
      'options.resourceTypes.collection',
      'Database collections',
    ),
    resources: collections.map((collection) => ({
      value: collection.name,
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

function settingsResource(
  context: Context,
  value: string,
  actions: readonly string[],
): Option & { actions: readonly Option[] } {
  return {
    value,
    label: translateAuthorization(
      context,
      `options.settings.${value}`,
      title(value),
    ),
    actions: actions.map((action) => actionOption(context, action)),
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

function subjectTypeOptions(context: Context): readonly Option[] {
  return [
    {
      value: 'authenticated',
      label: translateAuthorization(
        context,
        'options.subjectTypes.authenticated',
        'All signed-in users',
      ),
      description: translateAuthorization(
        context,
        'options.subjectTypes.authenticatedDescription',
        'Applies to every user with a valid signed-in session.',
      ),
    },
    {
      value: 'user',
      label: translateAuthorization(
        context,
        'options.subjectTypes.user',
        'Specific user',
      ),
    },
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

function sentenceCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
