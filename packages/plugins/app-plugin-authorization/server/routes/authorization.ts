import {
  AuthorizationDeniedError,
  type Authorization,
  type AuthorizationEnv,
} from '@nocobase/authorization/core';
import type { Auth } from '@nocobase/app-plugin-authentication';
import type { DatabaseConnection } from '@nocobase/db';
import { Hono, type Context } from 'hono';
import { appAuthorizationDatabase } from '../authorization.js';
import {
  describeCollection,
  listCollectionNames,
  type AuthorizationCollection,
} from '../database/index.js';
import type { AuthorizationAdministration } from '../administration.js';

export function createAuthorizationRoutes(
  auth: Auth,
  authorization: Authorization,
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
      data: await permissionSetOptions(authorization, connection),
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
        data: await databaseScopeRuleOptions(authorization, connection),
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

const crudActions = ['read', 'create', 'update', 'delete'] as const;
const administrationResources = [
  settingsResource('permission-sets', crudActions),
  settingsResource('default-access', crudActions),
  settingsResource('sharing-rules', crudActions),
  settingsResource('restriction-rules', crudActions),
] as const;

async function permissionSetOptions(
  authz: Authorization,
  connection: DatabaseConnection | undefined,
): Promise<object> {
  const collections = await databaseCollections(authz, connection);
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
      databaseResourceOptions(collections),
    ],
    subjectTypes: subjectTypeOptions(),
    ...databaseOptions(authz, collections),
  };
}

async function databaseScopeRuleOptions(
  authz: Authorization,
  connection: DatabaseConnection | undefined,
): Promise<object> {
  const collections = await databaseCollections(authz, connection);
  const collection = databaseResourceOptions(collections);
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
    ...databaseOptions(authz, collections),
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

/**
 * The Collections an application can grant on. db holds them, so an
 * application without the database plugin, or without a connection, grants
 * none of them.
 */
async function databaseCollections(
  authz: Authorization,
  connection: DatabaseConnection | undefined,
): Promise<readonly AuthorizationCollection[]> {
  if (!connection || !appAuthorizationDatabase(authz)) return [];
  const names = await listCollectionNames(connection);
  const described = await Promise.all(
    names.map((name) => describeCollection(connection, name)),
  );
  return described.filter((item) => item !== undefined);
}

function databaseResourceOptions(
  collections: readonly AuthorizationCollection[],
): {
  value: string;
  label: string;
  resources: readonly {
    value: string;
    label: string;
    actions: readonly { value: string; label: string }[];
  }[];
  actions: readonly { value: string; label: string }[];
} {
  const actions = crudActions.map((value) => ({
    value,
    label: sentenceCase(value),
  }));
  return {
    value: 'database.collection',
    label: 'Database collections',
    resources: collections.map((collection) => ({
      value: collection.name,
      label: collection.name,
      actions,
    })),
    actions,
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

function databaseOptions(
  authz: Authorization,
  collections: readonly AuthorizationCollection[],
): object {
  // An application may leave `databaseAuthorization` out of its plugin list;
  // the endpoint then answers with nothing to grant rather than failing.
  const database = appAuthorizationDatabase(authz);
  return {
    collections: collections.map(({ name, fields }) => ({ name, fields })),
    recordAccessPolicies: (database?.recordAccess.list() ?? []).map(
      (policy) => ({
        value: policy.key,
        label: policy.title ?? policy.key,
        description: policy.description,
      }),
    ),
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

function sentenceCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
