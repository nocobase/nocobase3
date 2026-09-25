import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import authentication from '@nocobase/app-plugin-authentication/server';
import authorization, {
  authorizationToken,
  type AppAuthorization,
} from '@nocobase/app-plugin-authorization/server';
import sharingRulesPlugin, {
  sharingRules,
} from '@nocobase/app-plugin-authz-sharing-rules/server';
import { Application } from '@nocobase/app-server/application';
import { CachingProvider } from '@nocobase/app-server/caching';
import {
  createAppPaths,
  type AppConfigAccessor,
} from '@nocobase/app-server/config';
import { DatabaseProvider } from '@nocobase/app-server/database';
import { IdGeneratorProvider } from '@nocobase/app-server/id-generator';
import { LoggingProvider } from '@nocobase/app-server/logging';
import {
  defineServerPlugins,
  resolveAppServerPlugins,
  type AppServerPlugin,
} from '@nocobase/app-server/plugins';
import { QueueProvider } from '@nocobase/app-server/queue';
import { SessionProvider } from '@nocobase/app-server/session';
import { createDefaultCachingConfig } from '@nocobase/caching';
import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import sqlite from '@nocobase/db-sqlite';
import { createSilentLoggingConfig } from '@nocobase/logging';
import { createSyncQueueConfig } from '@nocobase/queue';
import { createNullSessionConfig } from '@nocobase/session';

import {
  definePermissionSet,
  type PermissionSet,
} from '@nocobase/authorization/permission-sets';

import departments, {
  DIRECTORY_PAGE,
  directory,
  ORGANIZATION_SETTINGS,
  OWN_DEPARTMENTS,
} from '../server/index.js';
import {
  organizationServiceToken,
  type OrganizationService,
} from '../server/tokens.js';

export const ADMIN = { email: 'admin@nocobase.com', password: 'admin123' };
const ORIGIN = 'http://localhost';

export interface TestApp {
  readonly app: Application;
  readonly authz: AppAuthorization;
  readonly database: DatabaseManager;
  readonly organization: OrganizationService;
  request(
    method: string,
    pathname: string,
    options?: { cookie?: string; json?: unknown },
  ): Promise<Response>;
  /** Creates an account through sign-up and returns its id and session cookie. */
  signUp(name: string): Promise<TestUser>;
  signIn(email: string, password: string): Promise<string>;
  readonly directory: string;
  /** Stops the application; `keep` leaves the database for a restart on the same directory. */
  close(options?: { keep?: boolean }): Promise<void>;
}

export interface TestUser {
  readonly id: string;
  readonly email: string;
  readonly cookie: string;
}

function cookieOf(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
}

/**
 * A real application: authentication, authorization with the sharing-rules factory, and this plugin, on a fresh
 * SQLite file. Startup runs every plugin's migrations and seeds, exactly as an installing application does.
 */
export async function createTestApp(
  options: { directory?: string } = {},
): Promise<TestApp> {
  const directory =
    options.directory ??
    mkdtempSync(path.join(tmpdir(), 'departments-example-'));
  const values: Record<string, unknown> = {
    app: {
      name: 'main',
      publicOrigin: ORIGIN,
      publicBasePath: '/',
      internalBasePath: '',
      publicApiUrl: '/api',
    },
    auth: {
      secret: 'departments-example-test-secret-at-least-32-characters',
      baseURL: ORIGIN,
      emailAndPassword: { enabled: true, autoSignIn: false },
      session: { storeSessionInDatabase: true },
    },
    authorization: {
      permissionSets: { rootSet: 'root', defaultSet: 'member' },
      plugins: [sharingRules()],
    },
    caching: createDefaultCachingConfig(),
    database: {
      default: 'main',
      drivers: { sqlite },
      connections: {
        main: {
          dialect: 'sqlite',
          filename: path.join(directory, 'database.sqlite'),
          schemaManagement: 'managed',
        },
      },
    },
    logging: createSilentLoggingConfig(),
    queue: createSyncQueueConfig(),
    session: createNullSessionConfig(),
    snowflake: { workerId: 0 },
  };
  const config: AppConfigAccessor = {
    get: <TValue>(key: string): TValue => values[key] as TValue,
    raw: () => values,
    reload: () => Promise.resolve({ changedNamespaces: [] }),
    subscribe: () => () => undefined,
  };
  const app = new Application({
    config,
    paths: createAppPaths({ rootDir: directory }),
  });
  app.addServiceProvider(LoggingProvider);
  app.addServiceProvider(DatabaseProvider);
  app.addServiceProvider(CachingProvider);
  app.addServiceProvider(IdGeneratorProvider);
  app.addServiceProvider(SessionProvider);
  app.addServiceProvider(QueueProvider);
  app.addServerPlugins(
    resolveAppServerPlugins(
      directory,
      defineServerPlugins([
        authentication,
        authorization,
        sharingRulesPlugin,
        departments,
      ] as readonly AppServerPlugin[]),
    ),
  );
  await app.start();

  async function request(
    method: string,
    pathname: string,
    options: { cookie?: string; json?: unknown } = {},
  ): Promise<Response> {
    const headers = new Headers({ origin: ORIGIN });
    if (options.cookie) headers.set('cookie', options.cookie);
    if (options.json !== undefined)
      headers.set('content-type', 'application/json');
    return app.fetch(
      new Request(new URL(pathname, ORIGIN), {
        method,
        headers,
        ...(options.json === undefined
          ? {}
          : { body: JSON.stringify(options.json) }),
      }),
    );
  }

  async function signIn(email: string, password: string): Promise<string> {
    const response = await request('POST', '/api/auth/sign-in/email', {
      json: { email, password },
    });
    if (!response.ok)
      throw new Error(
        `Sign-in failed: ${response.status} ${await response.text()}`,
      );
    return cookieOf(response);
  }

  let sequence = 0;
  async function signUp(name: string): Promise<TestUser> {
    sequence += 1;
    const email = `${name.toLowerCase()}-${sequence}@example.test`;
    const password = 'test-password-123';
    const response = await request('POST', '/api/auth/sign-up/email', {
      json: { name, email, password },
    });
    if (!response.ok)
      throw new Error(
        `Sign-up failed: ${response.status} ${await response.text()}`,
      );
    const body = (await response.json()) as { user: { id: string } };
    return { id: body.user.id, email, cookie: await signIn(email, password) };
  }

  return {
    app,
    authz: app.container.resolve(authorizationToken),
    database: app.container.resolve(databaseManagerToken),
    organization: app.container.resolve(organizationServiceToken),
    request,
    signUp,
    signIn,
    directory,
    async close({ keep = false } = {}) {
      await app.shutdown();
      if (!keep) rmSync(directory, { recursive: true, force: true });
    },
  };
}

/** A permission set that opens the directory page and views departments through `scope`. */
export function directorySet(
  key: string,
  scope: string = OWN_DEPARTMENTS,
): PermissionSet {
  return definePermissionSet(key)
    .grant({
      resource: { type: 'page', id: DIRECTORY_PAGE },
      actions: [{ action: 'access' }],
    })
    .grant(directory.reference().grant({ view: { departments: scope } }))
    .build();
}

/** A permission set holding the organisation settings item with the given actions. */
export function organizationSettingsSet(
  authz: AppAuthorization,
  key: string,
  actions: readonly ('read' | 'update')[],
): PermissionSet {
  return definePermissionSet(key)
    .grant(authz.settings.grant(ORGANIZATION_SETTINGS, actions))
    .build();
}

/** Creates departments in order; each entry is `[id, parentId]`, titled after its id. */
export async function createTree(
  organization: OrganizationService,
  entries: readonly (readonly [string, string | null])[],
): Promise<void> {
  for (const [id, parentId] of entries)
    await organization.createDepartment({ id, title: `Dept ${id}`, parentId });
}

/** What the directory endpoint answers for a session: its status and the department ids it lists. */
export async function readDirectory(
  test: TestApp,
  cookie: string,
): Promise<{ status: number; ids: string[] }> {
  const response = await test.request(
    'GET',
    '/api/departments-example/directory',
    { cookie },
  );
  if (response.status !== 200) return { status: response.status, ids: [] };
  const body = (await response.json()) as { data: { id: string }[] };
  return { status: 200, ids: body.data.map((row) => row.id).sort() };
}
