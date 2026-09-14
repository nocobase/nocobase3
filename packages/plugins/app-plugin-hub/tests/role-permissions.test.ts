import { fileURLToPath } from 'node:url';

import {
  authenticationToken,
  type Auth,
} from '@nocobase/app-plugin-authentication';
import {
  createAppAuthorization,
  authorizationToken,
} from '@nocobase/app-plugin-authorization';
import usersPlugin, {
  userManagementServiceToken,
  type UserManagementService,
} from '@nocobase/app-plugin-users/server';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { createDatabaseManager, createMigrator } from '@nocobase/db';
import sqlite from '@nocobase/db-sqlite';
import { ServiceContainer } from '@nocobase/service-provider';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { registerHubResources } from '../server/authorization.js';
import { apiRoutes as hubApiRoutes } from '../server/routes/index.js';
import { hubServiceToken, type HubService } from '../server/tokens.js';

const HUB_ROLES = ['hub-administrator', 'hub-operator', 'hub-viewer'] as const;
const UsersProvider = usersPlugin.serviceProviders[0]!;
const userApiRoutes = usersPlugin.routes[0]!;

type HubRole = (typeof HUB_ROLES)[number];

interface ApiCase {
  readonly name: string;
  readonly method?: string;
  readonly path: string;
  readonly body?: BodyInit;
  readonly allowed: readonly HubRole[];
  readonly expectedStatus?: number;
}

const ADMINISTRATOR_AND_OPERATOR = [
  'hub-administrator',
  'hub-operator',
] as const;
const ALL_HUB_ROLES = HUB_ROLES;

const HUB_API_CASES: readonly ApiCase[] = [
  {
    name: 'list applications',
    path: '/hub/apps',
    allowed: ALL_HUB_ROLES,
  },
  {
    name: 'read the role matrix',
    path: '/hub/roles',
    allowed: ['hub-administrator'],
  },
  {
    name: 'create an application',
    method: 'POST',
    path: '/hub/apps',
    body: json({ id: 'customer', name: 'Customer' }),
    allowed: ADMINISTRATOR_AND_OPERATOR,
  },
  {
    name: 'read an application',
    path: '/hub/apps/customer',
    allowed: ALL_HUB_ROLES,
  },
  {
    name: 'list releases',
    path: '/hub/apps/customer/releases',
    allowed: ALL_HUB_ROLES,
  },
  {
    name: 'read a release',
    path: '/hub/apps/customer/releases/release-1',
    allowed: ALL_HUB_ROLES,
  },
  {
    name: 'read a release config template',
    path: '/hub/apps/customer/releases/release-1/config-template',
    allowed: ADMINISTRATOR_AND_OPERATOR,
  },
  {
    name: 'upload a release',
    method: 'POST',
    path: '/hub/apps/customer/releases',
    body: 'artifact',
    allowed: ADMINISTRATOR_AND_OPERATOR,
  },
  {
    name: 'read raw configuration',
    path: '/hub/apps/customer/config',
    allowed: ADMINISTRATOR_AND_OPERATOR,
  },
  {
    name: 'update raw configuration',
    method: 'PUT',
    path: '/hub/apps/customer/config',
    body: json({ content: 'feature: true\n' }),
    allowed: ADMINISTRATOR_AND_OPERATOR,
  },
  {
    name: 'update application settings',
    method: 'PUT',
    path: '/hub/apps/customer/settings',
    body: json({ activation: 'lazy' }),
    allowed: ADMINISTRATOR_AND_OPERATOR,
  },
  {
    name: 'deploy an application',
    method: 'POST',
    path: '/hub/apps/customer/deploy',
    body: json({ releaseId: 'release-1' }),
    allowed: ADMINISTRATOR_AND_OPERATOR,
    expectedStatus: 202,
  },
  {
    name: 'list deployments',
    path: '/hub/apps/customer/deployments',
    allowed: ALL_HUB_ROLES,
  },
  {
    name: 'read a deployment',
    path: '/hub/apps/customer/deployments/deployment-1',
    allowed: ALL_HUB_ROLES,
  },
  {
    name: 'rollback an application',
    method: 'POST',
    path: '/hub/apps/customer/rollback',
    body: json({ deploymentId: 'deployment-1' }),
    allowed: ADMINISTRATOR_AND_OPERATOR,
    expectedStatus: 202,
  },
  {
    name: 'stop an application',
    method: 'POST',
    path: '/hub/apps/customer/stop',
    allowed: ADMINISTRATOR_AND_OPERATOR,
  },
  {
    name: 'start an application',
    method: 'POST',
    path: '/hub/apps/customer/start',
    allowed: ADMINISTRATOR_AND_OPERATOR,
  },
  {
    name: 'restart an application',
    method: 'POST',
    path: '/hub/apps/customer/restart',
    allowed: ADMINISTRATOR_AND_OPERATOR,
  },
  {
    name: 'refresh application state',
    method: 'POST',
    path: '/hub/apps/customer/refresh',
    allowed: ADMINISTRATOR_AND_OPERATOR,
  },
  {
    name: 'remove an application',
    method: 'DELETE',
    path: '/hub/apps/customer',
    allowed: ['hub-administrator'],
  },
  {
    name: 'read Host status',
    path: '/hub/host/status',
    allowed: ALL_HUB_ROLES,
  },
];

const USER_API_CASES: readonly ApiCase[] = [
  {
    name: 'read user options',
    path: '/users/options',
    allowed: ['hub-administrator'],
  },
  {
    name: 'list users',
    path: '/users',
    allowed: ['hub-administrator'],
  },
  {
    name: 'create a user and assign a role',
    method: 'POST',
    path: '/users',
    body: json({
      name: 'Alice',
      email: 'alice@example.com',
      password: 'secret123',
      roleScopes: { hub: 'hub-viewer' },
    }),
    allowed: ['hub-administrator'],
    expectedStatus: 201,
  },
  {
    name: 'update a user',
    method: 'PATCH',
    path: '/users/user-1',
    body: json({ name: 'Updated' }),
    allowed: ['hub-administrator'],
  },
  {
    name: 'disable a user',
    method: 'POST',
    path: '/users/user-1/disable',
    allowed: ['hub-administrator'],
  },
  {
    name: 'enable a user',
    method: 'POST',
    path: '/users/user-1/enable',
    allowed: ['hub-administrator'],
  },
  {
    name: 'assign a user role',
    method: 'PUT',
    path: '/users/user-1/role-scopes/hub',
    body: json({ value: 'hub-viewer' }),
    allowed: ['hub-administrator'],
  },
  {
    name: 'reset a password',
    method: 'POST',
    path: '/users/user-1/reset-password',
    body: json({ password: 'secret123' }),
    allowed: ['hub-administrator'],
  },
  {
    name: 'revoke Sessions',
    method: 'POST',
    path: '/users/user-1/revoke-sessions',
    allowed: ['hub-administrator'],
  },
];

describe('Hub role API permissions', () => {
  const database = createDatabaseManager({
    drivers: { sqlite },
    default: 'main',
    connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
  });
  const authorization = createAppAuthorization({
    connection: database.connection(),
  });
  const hub = createHubService();
  const users = createUserService();

  beforeAll(async () => {
    await migratePackage(
      database,
      '@nocobase/app-plugin-authentication',
      '../../app-plugin-authentication/database/migrations',
    );
    await migratePackage(
      database,
      '@nocobase/app-plugin-authorization',
      '../../app-plugin-authorization/database/migrations',
    );
    await migratePackage(
      database,
      '@nocobase/app-plugin-hub',
      '../database/migrations',
    );
    registerHubResources(authorization);

    const resourceContainer = new ServiceContainer();
    resourceContainer.instance(authorizationToken, authorization);
    await new UsersProvider(createApplication(resourceContainer)).boot();

    for (const role of HUB_ROLES) {
      await authorization.permissionSets.assign({
        subject: { type: 'user', id: role },
        permissionSet: role,
      });
    }
  });

  afterAll(async () => {
    await database.destroy();
  });

  describe.each(HUB_ROLES)('%s', (role) => {
    it.each(HUB_API_CASES)('$name matches the role grant', async (scenario) => {
      const router = await hubApiRoutes.createRouter(
        createRoleApplication(role, authorization, hub, users),
      );
      const response = await request(router, scenario);

      expect(response.status).toBe(
        scenario.allowed.includes(role)
          ? (scenario.expectedStatus ?? 200)
          : 403,
      );
    });

    it.each(USER_API_CASES)(
      '$name matches the role grant',
      async (scenario) => {
        const router = await userApiRoutes.createRouter(
          createRoleApplication(role, authorization, hub, users),
        );
        const response = await request(router, scenario);

        expect(response.status).toBe(
          scenario.allowed.includes(role)
            ? (scenario.expectedStatus ?? 200)
            : 403,
        );
      },
    );
  });
});

function createRoleApplication(
  role: HubRole,
  authorization: ReturnType<typeof createAppAuthorization>,
  hub: HubService,
  users: UserManagementService,
): AppPluginApplication {
  const container = new ServiceContainer();
  container.instance(authenticationToken, {
    required: () => async (context, next) => {
      context.set('auth', {
        user: { id: role },
        session: { id: `session-${role}`, userId: role },
      });
      await next();
    },
  } as unknown as Auth);
  container.instance(authorizationToken, authorization);
  container.instance(hubServiceToken, hub);
  container.instance(userManagementServiceToken, users);
  return createApplication(container);
}

function createApplication(container: ServiceContainer): AppPluginApplication {
  return {
    appName: 'hub',
    publicBasePath: '',
    config: {} as AppPluginApplication['config'],
    paths: {} as AppPluginApplication['paths'],
    router: {} as AppPluginApplication['router'],
    container,
  };
}

function createHubService(): HubService {
  const now = new Date('2026-09-09T00:00:00Z');
  const app = {
    id: 'customer',
    name: 'Customer',
    description: null,
    currentDeploymentId: 'deployment-1',
    enabled: true,
    basePath: '/customer',
    backend: 'in-process',
    startupMode: 'lazy',
    createdAt: now,
    updatedAt: now,
  } as const;
  const runtime = {
    hostAvailable: true,
    state: 'running',
    version: '1.0.0',
    startedAt: now.toISOString(),
    lastAccessedAt: now.toISOString(),
    activeRequests: 0,
    hostRevision: 1,
    error: null,
  } as const;
  const detail = {
    app,
    runtime,
    currentVersion: '1.0.0',
    hasReleases: true,
    hasPendingDeployment: false,
    deployment: {
      desiredReleaseId: 'release-1',
      observedReleaseId: 'release-1',
      desiredState: 'running',
      observedState: 'running',
      activation: 'lazy',
      basePath: '/customer',
      config: { mode: 'file' },
      error: null,
      updatedAt: now,
    },
    hostUrl: 'http://127.0.0.1:13000',
  } as const;
  const release = {
    id: 'release-1',
    appId: 'customer',
    version: '1.0.0',
    artifactKey: 'releases/customer/release-1.tgz',
    checksum: 'a'.repeat(64),
    size: 8,
    configTemplate: 'feature: true\n',
    manifest: null,
    createdAt: now,
  } as const;
  const deployment = {
    id: 'deployment-1',
    appId: 'customer',
    releaseId: 'release-1',
    kind: 'deploy',
    rollbackTargetDeploymentId: null,
    previousDeploymentId: null,
    status: 'queued',
    phase: 'queued',
    config: { mode: 'file' },
    cacheHit: null,
    hostRevision: null,
    error: null,
    createdAt: now,
    startedAt: null,
    finishedAt: null,
  } as const;
  return {
    listApps: vi.fn(() => Promise.resolve([detail])),
    getApp: vi.fn(() => Promise.resolve(detail)),
    createApp: vi.fn(() => Promise.resolve(detail)),
    listReleases: vi.fn(() => Promise.resolve([release])),
    getRelease: vi.fn(() => Promise.resolve(release)),
    createRelease: vi.fn(() => Promise.resolve(release)),
    readConfig: vi.fn(() =>
      Promise.resolve({ mode: 'file', content: 'feature: true\n' }),
    ),
    updateConfig: vi.fn(() =>
      Promise.resolve({ mode: 'file', content: 'feature: true\n' }),
    ),
    updateSettings: vi.fn(() => Promise.resolve(detail)),
    listDeployments: vi.fn(() =>
      Promise.resolve({
        items: [{ ...deployment, release }],
        total: 1,
        page: 1,
        pageSize: 20,
      }),
    ),
    getDeployment: vi.fn(() => Promise.resolve(deployment)),
    deploy: vi.fn(() => Promise.resolve(deployment)),
    rollback: vi.fn(() => Promise.resolve({ ...deployment, kind: 'rollback' })),
    refresh: vi.fn(() => Promise.resolve(detail)),
    start: vi.fn(() => Promise.resolve(detail)),
    restart: vi.fn(() => Promise.resolve(detail)),
    stop: vi.fn(() => Promise.resolve(detail)),
    remove: vi.fn(() => Promise.resolve()),
    hostStatus: vi.fn(() => Promise.resolve({} as never)),
    restoreDesiredState: vi.fn(() => Promise.resolve()),
    createDeploymentSet: vi.fn(() => Promise.resolve({} as never)),
    hostUrl: vi.fn(() => null),
    shutdown: vi.fn(() => Promise.resolve()),
  };
}

function createUserService(): UserManagementService {
  const now = new Date('2026-09-09T00:00:00Z');
  const user = {
    id: 'user-1',
    name: 'Alice',
    email: 'alice@example.com',
    emailVerified: false,
    disabledAt: null,
    createdAt: now,
    updatedAt: now,
    roleScopes: { hub: 'hub-viewer' },
  } as const;
  return {
    options: vi.fn(() => Promise.resolve({ roleScopes: [] })),
    list: vi.fn(() =>
      Promise.resolve({ items: [user], total: 1, page: 1, pageSize: 20 }),
    ),
    create: vi.fn(() => Promise.resolve(user)),
    update: vi.fn(() => Promise.resolve(user)),
    disable: vi.fn(() => Promise.resolve({ ...user, disabledAt: now })),
    enable: vi.fn(() => Promise.resolve(user)),
    replaceRoleScope: vi.fn(() => Promise.resolve(user)),
    resetPassword: vi.fn(() => Promise.resolve()),
    revokeSessions: vi.fn(() => Promise.resolve()),
  };
}

function request(
  router: Awaited<ReturnType<typeof hubApiRoutes.createRouter>>,
  scenario: ApiCase,
): Promise<Response> {
  const hasJsonBody =
    typeof scenario.body === 'string' && scenario.body.startsWith('{');
  return router.request(scenario.path, {
    method: scenario.method ?? 'GET',
    ...(scenario.body === undefined
      ? {}
      : {
          body: scenario.body,
          ...(hasJsonBody
            ? { headers: { 'content-type': 'application/json' } }
            : {}),
        }),
  });
}

function json(value: unknown): string {
  return JSON.stringify(value);
}

async function migratePackage(
  database: ReturnType<typeof createDatabaseManager>,
  packageName: string,
  directory: string,
): Promise<void> {
  await createMigrator({
    database,
    packageName,
    directory: fileURLToPath(new URL(directory, import.meta.url)),
  }).latest();
}
