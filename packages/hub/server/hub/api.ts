import type { Auth, AuthSession } from '@nocobase/app-plugin-authentication';
import { AppRegistryError } from '@nocobase/app-host';
import type {
  AppDeploymentResult,
  AppRuntimeRegistry,
  AppSnapshot,
} from '@nocobase/app-host';
import { createCaching, type Counter } from '@nocobase/caching';
import { getConnInfo } from '@hono/node-server/conninfo';
import { Hono, type Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { createHash } from 'node:crypto';

import type { HubDatabaseRuntime } from './database.ts';
import {
  HubAuthorization,
  type AuthorizedHubActor,
  type HubAction,
  type HubCapabilities,
  type HubResource,
} from './authorization.ts';
import {
  HubDomainError,
  HubStore,
  type CreateApplicationInput,
  type CreateDeploymentInput,
  type DeploymentListOptions,
  type HubListOptions,
} from './store.ts';
import { LocalHostAdapter } from './local-host-adapter.ts';
import {
  HubManagementStore,
  type ApplicationListOptions,
  type ApplicationAccessListOptions,
  type AuditListOptions,
  type HubSettingsPatch,
  type ManagedApplication,
  type PublicRelease,
  type MemberAccessInput,
  type MemberListOptions,
  type MemberSort,
  type ReleaseListOptions,
} from './management-store.ts';
import {
  RuntimeSecretService,
  type ActiveRuntimeSecret,
  type RuntimeSecretEncryptionKey,
  type RuntimeSecretSummary,
} from './runtime-secret-service.ts';
import { HubStorageService } from './storage-service.ts';
import { HUB_ROLE_DEFINITIONS } from './authorization.ts';
import { HubIdempotencyService } from './idempotency-service.ts';
import {
  ReleaseUploadService,
  type ReleaseUploadActor,
  type ReleaseUploadCreateInput,
} from './release-upload-service.ts';
import {
  AGENT_SCOPES,
  AgentAuthService,
  type AgentAccessRequirement,
  type AgentApplicationScope,
  type AgentPrincipal,
  type AgentScope,
} from './agent-auth-service.ts';
import {
  DEPLOYMENT_STATUSES,
  DEPLOYMENT_TYPES,
  APPLICATION_RUNTIME_STATES,
  type ApplicationRuntimeState,
  type HubApplication,
  type HubDeployment,
  type HubRelease,
  type HubUserSummary,
} from './types.ts';
import {
  HubInvitationService,
  type CreateInvitationInput,
  type CreatedInvitation,
  type InvitationAccessInput,
  type InvitationListOptions,
  type InvitationStatus,
  type ManagedInvitation,
} from './invitation-service.ts';
import {
  DefaultApplicationBootstrap,
  type DefaultApplicationStatus,
} from './default-application-bootstrap.ts';

export interface HubApiDeps {
  database: HubDatabaseRuntime;
  /** Public authentication instance. It should have Better Auth sign-up disabled. */
  auth: Auth;
  /** Setup-only authentication instance, allowed to create the first user. */
  bootstrapAuth: Auth;
  registry?: AppRuntimeRegistry;
  releaseRoot?: string;
  /** Shared runtime secret injected into embedded Apps; never exposed in API responses. */
  appAuthSecret?: string;
  appName: string;
  publicBasePath: string;
  /** Origin derived from the configured public/auth URL by the composition root. */
  authoritativeOrigin?: string;
  /** Public origin used to construct APP links; never inferred from a request. */
  appPublicOrigin?: string;
  /** Directory containing metadata.json and the packaged initial Release. */
  defaultAppResourcesDirectory?: string;
  /** Encryption key resolved by the composition root. */
  runtimeSecretEncryptionKey?:
    RuntimeSecretEncryptionKey | Promise<RuntimeSecretEncryptionKey>;
  /** Optional upload limits. */
  maxUploadBytes?: number;
  maxArtifactBytes?: number;
  uploadTtlSeconds?: number;
  /** Domain-separated secret used only to hash opaque Agent credentials. */
  agentTokenHashSecret?: string;
}

export interface HubApiEnvironment {
  Variables: {
    requestId: string;
    actor: AuthorizedHubActor;
  };
}

export interface HubApiOptions {
  recoverDeployments?: boolean;
}

export interface HubApi extends Hono<HubApiEnvironment> {
  readonly ready: Promise<void>;
  close(): Promise<void>;
}

type HubContext = Context<HubApiEnvironment>;

interface AuthenticatedHubActor extends AuthorizedHubActor {
  readonly agent?: AgentPrincipal;
}

const AGENT_SCOPE_CAPABILITIES: readonly [
  AgentScope,
  HubResource,
  HubAction,
][] = [
  ['apps:create', 'hub.app', 'create'],
  ['apps:read', 'hub.app', 'read'],
  ['releases:read', 'hub.release', 'read'],
  ['releases:publish', 'hub.release', 'create'],
  ['deployments:read', 'hub.deployment', 'read'],
  ['deployments:deploy', 'hub.deployment', 'deploy'],
  ['deployments:rollback', 'hub.deployment', 'rollback'],
  ['deployments:redeploy', 'hub.deployment', 'redeploy'],
  ['runtime:read', 'hub.runtime', 'read'],
  ['runtime:control', 'hub.runtime', 'control'],
];

const PUBLIC_INTERNAL_ERROR_MESSAGE = 'An unexpected internal error occurred.';
const JSON_CONTENT_TYPE = 'application/json';
const INVITATION_RATE_LIMIT_WINDOW_MS = 60_000;
const INVITATION_GLOBAL_RATE_LIMIT = 12;
const INVITATION_TOKEN_RATE_LIMIT = 6;
const AUDIT_EXPORT_MAX_ROWS = 10_000;
const AUDIT_EXPORT_RATE_LIMIT_WINDOW_MS = 60_000;
const AUDIT_EXPORT_RATE_LIMIT = 5;
const DEPLOYMENT_EXPORT_MAX_ROWS = 10_000;
const DEPLOYMENT_EXPORT_RATE_LIMIT_WINDOW_MS = 60_000;
const DEPLOYMENT_EXPORT_RATE_LIMIT = 5;
const AUDIT_ACTIONS = new Set([
  'application.created',
  'application.updated',
  'application.archived',
  'application.restored',
  'release.published',
  'release.pinned',
  'release.unpinned',
  'deployment.requested',
  'deployment.succeeded',
  'deployment.failed',
  'runtime.started',
  'runtime.evicted',
  'runtime.restarted',
  'runtimeSecret.rotated',
  'runtimeSecret.rotationFailed',
  'credential.authorized',
  'credential.revoked',
  'member.invited',
  'member.updated',
  'permission.updated',
  'settings.updated',
  'defaultApplication.bootstrapped',
  'defaultApplication.bootstrapFailed',
  'setup.owner.created',
]);

export function createHubApi(
  deps: HubApiDeps,
  options: HubApiOptions = {},
): HubApi {
  const store = new HubStore(deps.database.connection);
  const managementStore = new HubManagementStore(deps.database.connection, {
    roles: HUB_ROLE_DEFINITIONS,
  });
  const authorization = new HubAuthorization(store);
  const host = new LocalHostAdapter({
    registry: deps.registry,
    releaseRoot: deps.releaseRoot,
    appAuthSecret: deps.appAuthSecret,
  });
  const idempotency = new HubIdempotencyService(deps.database.connection);
  const rateLimitCaching = createCaching();
  const invitationRateLimiter = new InvitationRateLimiter(
    rateLimitCaching.getCounter({ namespace: 'hub-invitation-acceptance' }),
  );
  const auditExportRateLimiter = new AuditExportRateLimiter(
    rateLimitCaching.getCounter({ namespace: 'hub-audit-export' }),
  );
  const deploymentExportRateLimiter = new DeploymentExportRateLimiter(
    rateLimitCaching.getCounter({ namespace: 'hub-deployment-export' }),
  );
  const invitations = new HubInvitationService(deps.database.connection, {
    hubDisplayName: deps.appName,
    roles: HUB_ROLE_DEFINITIONS.map((role) => ({
      id: role.id,
      name: roleDisplayName(role.id),
      scopes: role.scopes,
    })),
    auth: deps.auth,
  });
  const storage = new HubStorageService({ releaseRoot: deps.releaseRoot });
  const agentAuth = deps.agentTokenHashSecret
    ? new AgentAuthService(deps.database.connection, {
        tokenHashSecret: deps.agentTokenHashSecret,
        verificationUri: new URL(
          `${normalizePath(deps.publicBasePath)}/agent-authorize`,
          `${deps.authoritativeOrigin ?? 'http://localhost'}/`,
        ).toString(),
      })
    : undefined;
  const releaseUploads = deps.releaseRoot
    ? new ReleaseUploadService(deps.database.connection, {
        releaseRoot: deps.releaseRoot,
        maxArchiveBytes: deps.maxUploadBytes,
        maxExtractedBytes: deps.maxArtifactBytes,
        uploadTtlSeconds: deps.uploadTtlSeconds,
      })
    : undefined;
  let runtimeSecrets: RuntimeSecretService | undefined;
  const controlLocks = new ApplicationControlLocks();
  const coordinator = new DeploymentCoordinator(
    store,
    managementStore,
    host,
    () => runtimeSecrets,
    controlLocks,
  );
  let defaultApplicationBootstrap: DefaultApplicationBootstrap | undefined;
  const api = new Hono<HubApiEnvironment>() as HubApi;
  const startedAt = new Date().toISOString();
  let setupTail: Promise<void> = Promise.resolve();
  let ready: Promise<void> = Promise.all([
    deps.database.ready,
    Promise.resolve(deps.runtimeSecretEncryptionKey),
  ]).then(([, encryptionKey]): void => {
    if (encryptionKey) {
      runtimeSecrets = new RuntimeSecretService(
        deps.database.connection,
        encryptionKey,
      );
    }
  });

  const requireRuntimeSecretService = (): RuntimeSecretService => {
    if (!runtimeSecrets) {
      throw new HubDomainError(
        'RUNTIME_SECRET_SERVICE_UNAVAILABLE',
        'Runtime secret encryption is not configured.',
        { status: 503, retryable: false },
      );
    }
    return runtimeSecrets;
  };

  const requireReleaseUploadService = (): ReleaseUploadService => {
    if (!releaseUploads) {
      throw new HubDomainError(
        'RELEASE_STORAGE_UNAVAILABLE',
        'Hub release storage is not configured.',
        { status: 503, retryable: false },
      );
    }
    return releaseUploads;
  };

  const requireAgentAuthService = (): AgentAuthService => {
    if (!agentAuth) {
      throw new HubDomainError(
        'AGENT_AUTH_UNAVAILABLE',
        'Agent authorization is not configured.',
        { status: 503 },
      );
    }
    return agentAuth;
  };

  const managementEnabled = Boolean(
    deps.releaseRoot && deps.runtimeSecretEncryptionKey,
  );
  const authenticateActor = (
    context: HubContext,
  ): Promise<AuthenticatedHubActor> =>
    requireActor(
      context,
      deps.auth,
      authorization,
      managementStore,
      agentAuth,
      agentRequirementForRequest(context),
    );

  const projectApplication = async (
    applicationId: string,
    actor: AuthenticatedHubActor,
    detail: boolean,
  ): Promise<Record<string, unknown>> => {
    const application = await managementStore.getApplication(applicationId);
    if (!application) {
      throw concealedNotFound('APPLICATION_NOT_FOUND', applicationId);
    }
    const [canReadRelease, canReadRuntime, canReadSecret] = await Promise.all([
      agentScopeAllows(actor, 'releases:read', applicationId) &&
        authorization.can(actor.user.id, {
          resource: 'hub.release',
          action: 'read',
          applicationId,
        }),
      agentScopeAllows(actor, 'runtime:read', applicationId) &&
        authorization.can(actor.user.id, {
          resource: 'hub.runtime',
          action: 'read',
          applicationId,
        }),
      detail && !actor.agent
        ? authorization.can(actor.user.id, {
            resource: 'hub.runtimeSecret',
            action: 'read',
            applicationId,
          })
        : Promise.resolve(false),
    ]);
    const releases = canReadRelease
      ? await managementStore.listReleases(applicationId, {
          sort: '-createdAt',
          limit: 1,
        })
      : undefined;
    const latestRelease = releases?.items[0];
    const activeRelease =
      canReadRelease && application.activeReleaseId
        ? await managementStore.getRelease(
            applicationId,
            application.activeReleaseId,
          )
        : undefined;
    const runtimeSnapshot = canReadRuntime
      ? host.getRuntime(toHubApplication(application))
      : undefined;
    const runtime = canReadRuntime
      ? projectRuntime(application, runtimeSnapshot, deps.appPublicOrigin)
      : undefined;
    const secret =
      canReadSecret && runtimeSecrets
        ? await runtimeSecrets.summary(applicationId)
        : undefined;
    const links = applicationLinks(
      application,
      deps.publicBasePath,
      deps.appPublicOrigin,
    );
    return compactObject({
      ...applicationProjection(application),
      latestRelease: canReadRelease
        ? latestRelease
          ? releaseSummary(latestRelease)
          : null
        : undefined,
      activeRelease: canReadRelease
        ? activeRelease
          ? detail
            ? activeRelease
            : releaseSummary(activeRelease)
          : null
        : undefined,
      runtime,
      runtimeSecret: secret,
      links,
    });
  };

  api.use('*', async (context, next) => {
    await ready;
    const requestId =
      context.req.header('x-request-id')?.trim() || crypto.randomUUID();
    context.set('requestId', requestId);
    await next();
  });

  api.use('*', async (context, next) => {
    assertSecureMutation(context.req.raw, deps.authoritativeOrigin);
    await next();
  });

  api.onError((error, context) => {
    const response = errorResponse(
      context,
      error,
      context.get('requestId') ?? crypto.randomUUID(),
    );
    if (error instanceof HubRateLimitError) {
      response.headers.set('retry-after', String(error.retryAfterSeconds));
    }
    return response;
  });

  api.get('/healthz', (context) =>
    successResponse(context, {
      ok: true,
      appName: deps.appName,
      basePath: deps.publicBasePath,
      host: host.available() ? 'available' : 'unavailable',
    }),
  );

  api.get('/setup/status', async (context) => {
    const setupRequired = await store.isSetupRequired();
    const defaultApplication = defaultApplicationBootstrap
      ? await defaultApplicationBootstrap.status()
      : managementEnabled
        ? await getDefaultApplicationStatus(managementStore)
        : undefined;
    return successResponse(context, {
      setupRequired,
      ownerConfigured: !setupRequired,
      ...(defaultApplication ? { defaultApp: defaultApplication } : {}),
    });
  });

  api.post('/setup/default-app/retry', async (context) => {
    const actor = await authenticateActor(context);
    await authorization.require(actor.user.id, {
      resource: 'hub.app',
      action: 'create',
    });
    const body = await jsonBody(context);
    rejectUnknownKeys(body, []);
    const idempotencyKey = requireHeaderIdempotencyKey(context);
    const bootstrap = defaultApplicationBootstrap;
    if (!bootstrap) {
      throw new HubDomainError(
        'DEFAULT_APP_BOOTSTRAP_UNAVAILABLE',
        'Default application bootstrap is unavailable.',
        { status: 503, retryable: false },
      );
    }
    const current = await bootstrap.status();
    if (current.status === 'ready') {
      return successResponse(
        context,
        { defaultApp: current },
        { idempotent: true },
      );
    }
    if (current.status === 'failed' && !current.retryable) {
      throw new HubDomainError(
        'DEFAULT_APP_BOOTSTRAP_NOT_RETRYABLE',
        'The default application bootstrap failure is not retryable.',
        { status: 409, retryable: false },
      );
    }
    const execution = await idempotency.execute(
      {
        actorId: actor.user.id,
        credentialId: actor.agent?.credentialId,
        endpoint: 'POST /setup/default-app/retry',
        scopeKey: 'default-application',
        idempotencyKey,
        payload: body,
      },
      async () => {
        void bootstrap.retry().catch((error: unknown) => {
          logServerError(error, { operation: 'default-app-bootstrap-retry' });
        });
        return {
          defaultApp: {
            status: 'preparing',
            retryable: false,
            errorCode: null,
          } satisfies DefaultApplicationStatus,
          status: 202 as const,
        };
      },
    );
    return successResponse(
      context,
      { defaultApp: execution.value.defaultApp },
      { idempotent: execution.idempotent },
      execution.value.status,
    );
  });

  api.post('/setup/owner', async (context) => {
    const body = await jsonBody(context);
    const result = await withSetupLock(async () => {
      if (!(await store.isSetupRequired())) {
        throw new HubDomainError(
          'SETUP_ALREADY_COMPLETED',
          'Hub setup is already complete.',
          {
            status: 409,
          },
        );
      }
      const reservationToken = crypto.randomUUID();
      await store.reserveOwnerSetup(reservationToken);
      try {
        const email = requiredString(body.email, 'email');
        const password = requiredString(body.password, 'password');
        const name = requiredString(body.name, 'name');
        const username = optionalString(body.username);
        const bootstrap = deps.bootstrapAuth;
        const signupUrl = new URL(context.req.url);
        signupUrl.pathname = signupUrl.pathname.replace(
          /\/setup\/owner\/?$/,
          '/auth/sign-up/email',
        );
        const signupRequest = new Request(signupUrl, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/json',
            origin: context.req.header('origin')!,
          },
          body: JSON.stringify({
            email,
            password,
            name,
            ...(username ? { username } : {}),
          }),
        });
        const signupResponse = await bootstrap.handler(signupRequest);
        const signupPayload = await readResponseJson(signupResponse);
        if (!signupResponse.ok) {
          if (signupResponse.status >= 500) {
            throw new HubDomainError(
              'INTERNAL_ERROR',
              PUBLIC_INTERNAL_ERROR_MESSAGE,
              { status: 500, retryable: true },
            );
          }
          throw new HubDomainError(
            stringProperty(signupPayload, 'code') ?? 'OWNER_SIGNUP_FAILED',
            stringProperty(signupPayload, 'message') ??
              'Unable to create the first owner.',
            {
              status:
                signupResponse.status >= 400 ? signupResponse.status : 422,
            },
          );
        }
        const user = signupPayload?.user;
        if (
          !user ||
          typeof user !== 'object' ||
          !('id' in user) ||
          typeof user.id !== 'string'
        ) {
          throw new HubDomainError(
            'OWNER_SIGNUP_INVALID_RESPONSE',
            'Authentication did not return a user.',
            {
              status: 502,
            },
          );
        }
        await store.initializeOwner({
          userId: user.id,
          reservationToken,
          requestId: context.get('requestId'),
        });
        return {
          payload: signupPayload,
          setCookie: signupResponse.headers.get('set-cookie'),
        };
      } catch (error) {
        await store
          .releaseOwnerSetupReservation(reservationToken)
          .catch(() => undefined);
        throw error;
      }
    });
    const response = successResponse(
      context,
      { user: result.payload.user, session: result.payload.session },
      undefined,
      201,
    );
    if (result.setCookie) response.headers.set('set-cookie', result.setCookie);
    return response;
  });

  api.on(['GET', 'POST'], '/auth/*', async (context) => {
    if (context.req.path.includes('/sign-up')) {
      return errorResponse(
        context,
        new HubDomainError(
          'PUBLIC_SIGNUP_DISABLED',
          'Public sign-up is disabled.',
          { status: 403 },
        ),
        context.get('requestId'),
      );
    }
    return deps.auth.handler(context.req.raw);
  });

  api.post('/agent-auth/device', async (context) => {
    const body = await jsonBody(context);
    const grant = await requireAgentAuthService().createDeviceAuthorization({
      clientId: requiredString(body.clientId, 'clientId'),
      clientName: requiredString(body.clientName, 'clientName'),
      scopes: parseAgentScopes(body.scopes),
      applicationScope: parseAgentApplicationScope(body.applicationScope),
    });
    return successResponse(context, grant, {}, 201);
  });

  api.post('/agent-auth/token', async (context) => {
    const body = await jsonBody(context);
    const grantType = requiredString(body.grantType, 'grantType');
    if (
      grantType !== 'urn:ietf:params:oauth:grant-type:device_code' &&
      grantType !== 'refresh_token'
    ) {
      throw new HubDomainError(
        'VALIDATION_ERROR',
        'grantType is unsupported.',
        { status: 422 },
      );
    }
    const tokens = await requireAgentAuthService().exchangeToken({
      grantType,
      clientId: requiredString(body.clientId, 'clientId'),
      deviceCode: optionalString(body.deviceCode) ?? undefined,
      refreshToken: optionalString(body.refreshToken) ?? undefined,
    });
    const response = successResponse(context, tokens);
    setCredentialResponseHeaders(response);
    return response;
  });

  api.post('/agent-auth/revoke', async (context) => {
    const body = await jsonBody(context);
    await requireAgentAuthService().revokeByRefreshToken(
      requiredString(body.clientId, 'clientId'),
      requiredString(body.refreshToken, 'refreshToken'),
    );
    return successResponse(context, { revoked: true });
  });

  api.post('/agent-authorizations/resolve', async (context) => {
    await authenticateActor(context);
    const body = await jsonBody(context);
    const authorizationRequest =
      await requireAgentAuthService().resolveAuthorization(
        requiredString(body.userCode, 'userCode'),
      );
    return successResponse(context, authorizationRequest);
  });

  api.post('/agent-authorizations/:id/approve', async (context) => {
    const actor = await authenticateActor(context);
    const body = await jsonBody(context);
    const scopes = parseAgentScopes(body.scopes);
    const applicationScope = parseAgentApplicationScope(body.applicationScope);
    const authorizedApplicationIds = await listAuthorizedApplicationIds(
      managementStore,
      authorization,
      actor.user.id,
    );
    const allowedScopes = await allowedAgentScopes(
      authorization,
      actor.user.id,
      applicationScope,
      authorizedApplicationIds,
    );
    const decision = await requireAgentAuthService().approveAuthorization(
      context.req.param('id'),
      {
        userId: actor.user.id,
        scopes,
        applicationScope,
        allowedScopes,
        authorizedApplicationIds,
      },
    );
    await managementStore.appendAuditLog({
      actorId: actor.user.id,
      action: 'credential.authorized',
      resource: 'credential',
      resourceId: context.req.param('id'),
      result: 'success',
      source: 'web',
      details: {
        clientId: decision.clientId,
        clientName: decision.clientName,
        scopes: decision.grantedScopes ?? [],
        applicationScope: decision.grantedApplicationScope,
      },
      requestId: context.get('requestId'),
    });
    return successResponse(context, decision);
  });

  api.post('/agent-authorizations/:id/deny', async (context) => {
    const actor = await authenticateActor(context);
    const body = await jsonBody(context);
    rejectUnknownKeys(body, []);
    return successResponse(
      context,
      await requireAgentAuthService().denyAuthorization(
        context.req.param('id'),
        actor.user.id,
      ),
    );
  });

  api.get('/agent-credentials', async (context) => {
    const actor = await authenticateActor(context);
    assertBrowserActor(actor);
    const status = context.req.query('status');
    const sort = context.req.query('sort');
    const allowedStatuses = ['active', 'revoked', 'expired'] as const;
    const allowedSorts = [
      'createdAt',
      '-createdAt',
      'lastUsedAt',
      '-lastUsedAt',
    ] as const;
    const page = await requireAgentAuthService().listCredentials(
      actor.user.id,
      {
        query: context.req.query('query')?.trim() || undefined,
        status: optionalAllowedQuery(status, allowedStatuses, 'status'),
        sort: optionalAllowedQuery(sort, allowedSorts, 'sort'),
        ...readPagination(context),
      },
    );
    return successResponse(context, page.items, pageMeta(page));
  });

  api.delete('/agent-credentials/:id', async (context) => {
    const actor = await authenticateActor(context);
    assertBrowserActor(actor);
    await requireAgentAuthService().revokeCredential(
      actor.user.id,
      context.req.param('id'),
    );
    await managementStore.appendAuditLog({
      actorId: actor.user.id,
      action: 'credential.revoked',
      resource: 'credential',
      resourceId: context.req.param('id'),
      result: 'success',
      source: 'web',
      details: {},
      requestId: context.get('requestId'),
    });
    return successResponse(context, { revoked: true });
  });

  api.get('/me', async (context) => {
    const actor = await authenticateActor(context);
    if (!actor.agent) return successResponse(context, actor);
    return successResponse(context, {
      user: actor.user,
      credential: {
        id: actor.agent.credentialId,
        name: actor.agent.clientName,
        clientId: actor.agent.clientId,
        scopes: actor.agent.scopes,
        applicationScope: actor.agent.applicationScope,
      },
      capabilities: await projectAgentCapabilities(actor, managementStore),
    });
  });

  api.get('/apps', async (context) => {
    const actor = await authenticateActor(context);
    if (managementEnabled) {
      const applicationIds = visibleApplicationIds(actor, 'hub.app', 'read');
      const options = readApplicationListOptions(context);
      const result = options.runtimeState
        ? await listApplicationsByRuntimeState({
            host,
            managementStore,
            options,
            applicationIds: intersectApplicationIds(
              applicationIds,
              visibleRuntimeApplicationIds(actor),
            ),
            runtimeState: options.runtimeState,
          })
        : await managementStore.listApplications({
            ...options,
            applicationIds,
          });
      const items = await Promise.all(
        result.items.map((item) => projectApplication(item.id, actor, false)),
      );
      return successResponse(context, items, pageMeta(result));
    }
    const applicationIds = visibleApplicationIds(actor, 'hub.app', 'read');
    const result = await store.listApplications({
      ...readPagination(context),
      applicationIds,
    });
    const items = await Promise.all(
      result.items.map(async (application) => {
        const canReadRelease =
          agentScopeAllows(actor, 'releases:read', application.id) &&
          (await authorization.can(actor.user.id, {
            resource: 'hub.release',
            action: 'read',
            applicationId: application.id,
          }));
        const activeRelease =
          canReadRelease && application.activeReleaseId
            ? await store.getRelease(application.activeReleaseId)
            : undefined;
        return compactObject({
          ...applicationProjection(application),
          activeRelease: canReadRelease
            ? activeRelease
              ? releaseSummary(activeRelease)
              : null
            : undefined,
        });
      }),
    );
    return successResponse(context, items, pageMeta(result));
  });

  api.post('/apps', async (context) => {
    const actor = await authenticateActor(context);
    if (managementEnabled) {
      await authorization.require(actor.user.id, {
        resource: 'hub.app',
        action: 'create',
      });
      const body = await jsonBody(context);
      const idempotencyKey = requireHeaderIdempotencyKey(context);
      const result = await idempotency.execute(
        {
          actorId: actor.user.id,
          credentialId: actor.agent?.credentialId,
          endpoint: 'POST /apps',
          scopeKey: 'global',
          idempotencyKey,
          payload: body,
        },
        async () => {
          const application = await createManagedApplication({
            body,
            actor,
            store,
            managementStore,
            runtimeSecrets: requireRuntimeSecretService(),
          });
          return await projectApplication(application.id, actor, true);
        },
      );
      return successResponse(
        context,
        result.value,
        { idempotent: result.idempotent },
        result.idempotent ? 200 : 201,
      );
    }
    await authorization.require(actor.user.id, {
      resource: 'hub.app',
      action: 'create',
    });
    const body = await jsonBody(context);
    const application = await store.createApplication(
      {
        slug: requiredString(body.slug, 'slug'),
        name: requiredString(body.name, 'name'),
        description: optionalString(body.description),
      } satisfies CreateApplicationInput,
      actor.user.id,
    );
    return successResponse(
      context,
      applicationProjection(application),
      undefined,
      201,
    );
  });

  api.get('/apps/:id', async (context) => {
    const actor = await authenticateActor(context);
    if (managementEnabled) {
      const applicationId = context.req.param('id');
      await requireManagedApplicationAccess(
        managementStore,
        authorization,
        actor.user.id,
        applicationId,
        'read',
      );
      const projected = await projectApplication(applicationId, actor, true);
      const response = successResponse(context, projected);
      setRevisionEtag(response, projected);
      return response;
    }
    const application = await requireAuthorizedApplication(
      store,
      authorization,
      actor.user.id,
      context.req.param('id'),
      'read',
    );
    const canReadRelease =
      agentScopeAllows(actor, 'releases:read', application.id) &&
      (await authorization.can(actor.user.id, {
        resource: 'hub.release',
        action: 'read',
        applicationId: application.id,
      }));
    const activeRelease =
      canReadRelease && application.activeReleaseId
        ? await store.getRelease(application.activeReleaseId)
        : undefined;
    return successResponse(
      context,
      compactObject({
        ...applicationProjection(application),
        activeRelease: canReadRelease
          ? activeRelease
            ? releaseProjection(activeRelease)
            : null
          : undefined,
      }),
    );
  });

  api.patch('/apps/:id', async (context) => {
    const actor = await authenticateActor(context);
    const applicationId = context.req.param('id');
    await requireManagedApplicationAccess(
      managementStore,
      authorization,
      actor.user.id,
      applicationId,
      'update',
    );
    const body = await jsonBody(context);
    rejectUnknownKeys(body, ['name', 'description']);
    const application = await managementStore.updateApplication(
      applicationId,
      {
        ...(Object.hasOwn(body, 'name')
          ? { name: requiredString(body.name, 'name') }
          : {}),
        ...(Object.hasOwn(body, 'description')
          ? { description: nullableString(body.description, 'description') }
          : {}),
      },
      requireIfMatchRevision(context),
    );
    await managementStore.appendAuditLog({
      actorId: actor.user.id,
      applicationId,
      action: 'application.updated',
      resource: 'application',
      resourceId: applicationId,
      result: 'success',
      source: 'web',
      details: { fields: Object.keys(body) },
      requestId: context.get('requestId'),
    });
    const projected = await projectApplication(applicationId, actor, true);
    const response = successResponse(context, projected);
    setRevisionEtag(response, application);
    return response;
  });

  api.post('/apps/:id/archive', async (context) => {
    const actor = await authenticateActor(context);
    const applicationId = context.req.param('id');
    const application = await requireManagedApplicationAccess(
      managementStore,
      authorization,
      actor.user.id,
      applicationId,
      'archive',
    );
    const expectedRevision = requireIfMatchRevision(context);
    const result = await controlLocks.run(applicationId, async () => {
      if (application.status !== 'archived' && host.available()) {
        await host.unregister(toHubApplication(application));
      }
      return managementStore.archiveApplication(
        applicationId,
        expectedRevision,
      );
    });
    if (!result.idempotent) {
      await managementStore.appendAuditLog({
        actorId: actor.user.id,
        applicationId,
        action: 'application.archived',
        resource: 'application',
        resourceId: applicationId,
        result: 'success',
        source: 'web',
        details: {},
        requestId: context.get('requestId'),
      });
    }
    const projected = await projectApplication(applicationId, actor, true);
    const response = successResponse(context, projected, {
      idempotent: result.idempotent,
    });
    setRevisionEtag(response, result.application);
    return response;
  });

  api.post('/apps/:id/restore', async (context) => {
    const actor = await authenticateActor(context);
    const applicationId = context.req.param('id');
    const application = await requireManagedApplicationAccess(
      managementStore,
      authorization,
      actor.user.id,
      applicationId,
      'restore',
    );
    const expectedRevision = requireIfMatchRevision(context);
    const result = await controlLocks.run(applicationId, async () => {
      if (
        application.status === 'archived' &&
        application.activeReleaseId &&
        host.available()
      ) {
        const [release, secret] = await Promise.all([
          store.getRelease(application.activeReleaseId),
          requireRuntimeSecretService().getActive(applicationId),
        ]);
        if (!release || release.applicationId !== applicationId) {
          throw new HubDomainError(
            'ACTIVE_RELEASE_NOT_FOUND',
            'The active release could not be restored.',
            { status: 409 },
          );
        }
        await host.prepare(
          toHubApplication(application),
          release,
          secret.secret,
          application.desiredRuntimeState === 'running',
        );
      }
      return managementStore.restoreApplication(
        applicationId,
        expectedRevision,
      );
    });
    if (!result.idempotent) {
      await managementStore.appendAuditLog({
        actorId: actor.user.id,
        applicationId,
        action: 'application.restored',
        resource: 'application',
        resourceId: applicationId,
        result: 'success',
        source: 'web',
        details: {},
        requestId: context.get('requestId'),
      });
    }
    const projected = await projectApplication(applicationId, actor, true);
    const response = successResponse(context, projected, {
      idempotent: result.idempotent,
    });
    setRevisionEtag(response, result.application);
    return response;
  });

  api.get('/apps/:id/runtime', async (context) => {
    const actor = await authenticateActor(context);
    const applicationId = context.req.param('id');
    const application = await requireManagedApplicationAccess(
      managementStore,
      authorization,
      actor.user.id,
      applicationId,
      'read',
      'hub.runtime',
    );
    return successResponse(
      context,
      projectRuntime(
        application,
        host.getRuntime(toHubApplication(application)),
        deps.appPublicOrigin,
      ),
    );
  });

  api.post('/apps/:id/runtime/start', async (context) => {
    const actor = await authenticateActor(context);
    const applicationId = context.req.param('id');
    await requireManagedApplicationAccess(
      managementStore,
      authorization,
      actor.user.id,
      applicationId,
      'control',
      'hub.runtime',
    );
    rejectUnknownKeys(await jsonBody(context), []);
    const value = await controlLocks.run(applicationId, async () => {
      const application = await requireCurrentManagedApplication(
        managementStore,
        applicationId,
      );
      assertRuntimeControlApplication(application);
      await assertRuntimeControlAvailable(store, applicationId);
      const current = host.getRuntime(toHubApplication(application));
      if (
        current?.state === 'active' &&
        application.desiredRuntimeState === 'running'
      ) {
        assertRuntimeReleaseMatches(application, current);
        return {
          application,
          snapshot: current,
          idempotent: true,
        };
      }
      assertRuntimeSnapshotControllable(current);
      const release = await getActiveRelease(store, application);
      const service = requireRuntimeSecretService();
      const secret = await service.getActive(applicationId);
      const hubApplication = toHubApplication(application);
      const result = current
        ? { app: current }
        : await host.start(
            hubApplication,
            release,
            secret.secret,
            `runtime-start-${crypto.randomUUID()}`,
          );
      let persisted: ManagedApplication;
      try {
        persisted = (
          await managementStore.setDesiredRuntimeState(applicationId, 'running')
        ).application;
      } catch (error) {
        if (application.desiredRuntimeState === 'stopped') {
          await host
            .deactivate(hubApplication, release, secret.secret)
            .catch((compensationError: unknown) => {
              logServerError(compensationError, {
                operation: 'runtime-start-compensation',
                applicationId,
              });
            });
        }
        throw error;
      }
      await service.markInjected(applicationId, secret.version);
      await managementStore.appendAuditLog({
        actorId: actor.user.id,
        applicationId,
        action: 'runtime.started',
        resource: 'runtime',
        resourceId: applicationId,
        result: 'success',
        source: 'web',
        details: { releaseId: release.id },
        requestId: context.get('requestId'),
      });
      return {
        application: persisted,
        snapshot: result.app,
        idempotent: false,
      };
    });
    return successResponse(
      context,
      projectRuntime(value.application, value.snapshot, deps.appPublicOrigin),
      { idempotent: value.idempotent },
    );
  });

  api.post('/apps/:id/runtime/stop', async (context) => {
    const actor = await authenticateActor(context);
    const applicationId = context.req.param('id');
    await requireManagedApplicationAccess(
      managementStore,
      authorization,
      actor.user.id,
      applicationId,
      'control',
      'hub.runtime',
    );
    rejectUnknownKeys(await jsonBody(context), []);
    const value = await controlLocks.run(applicationId, async () => {
      const application = await requireCurrentManagedApplication(
        managementStore,
        applicationId,
      );
      assertRuntimeControlApplication(application);
      await assertRuntimeControlAvailable(store, applicationId);
      const current = host.getRuntime(toHubApplication(application));
      assertRuntimeSnapshotControllable(current);
      if (current) assertRuntimeReleaseMatches(application, current);
      const release = await getActiveRelease(store, application);
      const service = requireRuntimeSecretService();
      const secret = await service.getActive(applicationId);
      const hubApplication = toHubApplication(application);
      await host.deactivate(hubApplication, release, secret.secret);
      if (application.desiredRuntimeState === 'stopped') {
        return { application, idempotent: true };
      }
      let persisted: ManagedApplication;
      try {
        persisted = (
          await managementStore.setDesiredRuntimeState(applicationId, 'stopped')
        ).application;
      } catch (error) {
        const compensate = current
          ? host.start(
              hubApplication,
              release,
              secret.secret,
              `runtime-stop-compensation-${crypto.randomUUID()}`,
            )
          : host.prepare(hubApplication, release, secret.secret, true);
        await compensate.catch((compensationError: unknown) => {
          logServerError(compensationError, {
            operation: 'runtime-stop-compensation',
            applicationId,
          });
        });
        throw error;
      }
      await managementStore.appendAuditLog({
        actorId: actor.user.id,
        applicationId,
        action: 'runtime.evicted',
        resource: 'runtime',
        resourceId: applicationId,
        result: 'success',
        source: 'web',
        details: {},
        requestId: context.get('requestId'),
      });
      return { application: persisted, idempotent: false };
    });
    return successResponse(
      context,
      projectRuntime(value.application, undefined, deps.appPublicOrigin),
      { idempotent: value.idempotent },
    );
  });

  api.post('/apps/:id/runtime/restart', async (context) => {
    const actor = await authenticateActor(context);
    const applicationId = context.req.param('id');
    await requireManagedApplicationAccess(
      managementStore,
      authorization,
      actor.user.id,
      applicationId,
      'control',
      'hub.runtime',
    );
    const body = await jsonBody(context);
    rejectUnknownKeys(body, []);
    const idempotencyKey = requireHeaderIdempotencyKey(context);
    const execution = await idempotency.execute(
      {
        actorId: actor.user.id,
        credentialId: actor.agent?.credentialId,
        endpoint: 'POST /apps/:id/runtime/restart',
        scopeKey: applicationId,
        idempotencyKey,
        payload: body,
      },
      () =>
        controlLocks.run(applicationId, async () => {
          const application = await requireCurrentManagedApplication(
            managementStore,
            applicationId,
          );
          assertRuntimeControlApplication(application);
          await assertRuntimeControlAvailable(store, applicationId);
          const current = host.getRuntime(toHubApplication(application));
          assertRuntimeSnapshotControllable(current);
          if (current) assertRuntimeReleaseMatches(application, current);
          const previousState = current
            ? 'running'
            : application.desiredRuntimeState === 'running'
              ? 'idle'
              : 'stopped';
          const release = await getActiveRelease(store, application);
          const service = requireRuntimeSecretService();
          const secret = await service.getActive(applicationId);
          const operationId = runtimeControlOperationId(
            actor,
            applicationId,
            'restart',
            idempotencyKey,
          );
          const result = current
            ? await host.restart(
                toHubApplication(application),
                release,
                secret.secret,
                operationId,
              )
            : await host.start(
                toHubApplication(application),
                release,
                secret.secret,
                operationId,
              );
          let persisted: ManagedApplication;
          try {
            persisted = (
              await managementStore.setDesiredRuntimeState(
                applicationId,
                'running',
              )
            ).application;
          } catch (error) {
            if (application.desiredRuntimeState === 'stopped') {
              await host
                .deactivate(
                  toHubApplication(application),
                  release,
                  secret.secret,
                )
                .catch((compensationError: unknown) => {
                  logServerError(compensationError, {
                    operation: 'runtime-restart-compensation',
                    applicationId,
                  });
                });
            }
            throw error;
          }
          await service.markInjected(applicationId, secret.version);
          await managementStore.appendAuditLog({
            actorId: actor.user.id,
            applicationId,
            action: 'runtime.restarted',
            resource: 'runtime',
            resourceId: applicationId,
            result: 'success',
            source: 'web',
            details: { releaseId: release.id, previousState },
            requestId: context.get('requestId'),
          });
          return {
            runtime: projectRuntime(
              persisted,
              result.app,
              deps.appPublicOrigin,
            ),
            previousState,
          };
        }),
    );
    return successResponse(context, execution.value.runtime, {
      idempotent: execution.idempotent,
      previousState: execution.value.previousState,
    });
  });

  api.get('/apps/:id/runtime-secret', async (context) => {
    const actor = await authenticateActor(context);
    const applicationId = context.req.param('id');
    await requireManagedApplicationAccess(
      managementStore,
      authorization,
      actor.user.id,
      applicationId,
      'read',
      'hub.runtimeSecret',
    );
    return successResponse(
      context,
      await requireRuntimeSecretService().summary(applicationId),
    );
  });

  api.post('/apps/:id/runtime-secret/rotate', async (context) => {
    const actor = await authenticateActor(context);
    const applicationId = context.req.param('id');
    await requireManagedApplicationAccess(
      managementStore,
      authorization,
      actor.user.id,
      applicationId,
      'rotate',
      'hub.runtimeSecret',
    );
    const body = await jsonBody(context);
    rejectUnknownKeys(body, []);
    const idempotencyKey = requireHeaderIdempotencyKey(context);
    const operationId = runtimeControlOperationId(
      actor,
      applicationId,
      'secret',
      idempotencyKey,
    );
    const execution = await idempotency.execute(
      {
        actorId: actor.user.id,
        credentialId: actor.agent?.credentialId,
        endpoint: 'POST /apps/:id/runtime-secret/rotate',
        scopeKey: applicationId,
        idempotencyKey,
        payload: body,
      },
      () =>
        controlLocks.run(applicationId, async () => {
          const application = await requireCurrentManagedApplication(
            managementStore,
            applicationId,
          );
          await assertRuntimeControlAvailable(store, applicationId);
          const service = requireRuntimeSecretService();
          const pending = await service.beginRotation(
            applicationId,
            operationId,
          );
          const active = await service.summary(applicationId);
          if (active.version === pending.version) return active;
          try {
            const summary = await convergeRuntimeSecretRotation({
              application,
              pending,
              operationId,
              store,
              host,
              service,
            });
            await appendRuntimeSecretAudit({
              managementStore,
              actorId: actor.user.id,
              applicationId,
              action: 'runtimeSecret.rotated',
              result: 'success',
              operationId,
              version: summary.version,
              requestId: context.get('requestId'),
            });
            return summary;
          } catch (error) {
            const domainError = toDomainError(error);
            await service
              .failPending(applicationId, operationId, domainError.code)
              .catch(() => undefined);
            await appendRuntimeSecretAudit({
              managementStore,
              actorId: actor.user.id,
              applicationId,
              action: 'runtimeSecret.rotationFailed',
              result: 'failure',
              operationId,
              failureCode: domainError.code,
              requestId: context.get('requestId'),
            }).catch((auditError: unknown) => {
              logServerError(auditError, {
                operation: 'runtime-secret-failure-audit',
                applicationId,
              });
            });
            throw error;
          }
        }),
    );
    return successResponse(context, execution.value, {
      idempotent: execution.idempotent,
    });
  });

  api.get('/roles', async (context) => {
    const actor = await authenticateActor(context);
    await authorization.require(actor.user.id, {
      resource: 'hub.permission',
      action: 'read',
    });
    return successResponse(
      context,
      managementStore.listRoles().map((role) => ({
        id: role.id,
        key: role.id,
        scope: role.scopes.includes('global') ? 'global' : 'application',
        scopes: role.scopes,
        descriptionKey: role.descriptionKey,
        capabilities: groupRoleCapabilities(role.capabilities ?? []),
      })),
    );
  });

  api.get('/invitations', async (context) => {
    const actor = await authenticateActor(context);
    await authorization.require(actor.user.id, {
      resource: 'hub.member',
      action: 'read',
    });
    const result = await invitations.listInvitations(
      readInvitationListOptions(context),
    );
    return successResponse(context, result.items, pageMeta(result));
  });

  api.post('/invitations', async (context) => {
    const actor = await authenticateActor(context);
    await authorization.require(actor.user.id, {
      resource: 'hub.member',
      action: 'create',
    });
    const body = await jsonBody(context);
    rejectUnknownKeys(body, ['email', 'expiresInDays', 'access']);
    const input = parseCreateInvitationInput(body);
    assertOwnerRoleAssignmentAllowed(actor, input.access.globalRoles);
    const idempotencyKey = requireHeaderIdempotencyKey(context);
    let created: CreatedInvitation | undefined;
    const result = await idempotency.execute<ManagedInvitation>(
      {
        actorId: actor.user.id,
        endpoint: 'POST /invitations',
        scopeKey: 'global',
        idempotencyKey,
        payload: body,
      },
      async () => {
        created = await invitations.createInvitation(input, actor.user.id, {
          acceptanceUrl: invitationAcceptanceUrl(context, deps),
        });
        await managementStore.appendAuditLog({
          actorId: actor.user.id,
          action: 'member.invited',
          resource: 'member',
          resourceId: created.id,
          result: 'success',
          source: 'web',
          details: {
            change: 'invitationCreated',
            invitationId: created.id,
            globalRoles: created.access.globalRoles,
            applicationIds: created.access.applications.map(
              (application) => application.applicationId,
            ),
          },
          requestId: context.get('requestId'),
        });
        return withoutInviteUrl(created);
      },
    );
    return successResponse(
      context,
      result.idempotent ? result.value : created,
      { idempotent: result.idempotent },
      result.idempotent ? 200 : 201,
    );
  });

  api.delete('/invitations/:id', async (context) => {
    const actor = await authenticateActor(context);
    await authorization.require(actor.user.id, {
      resource: 'hub.member',
      action: 'delete',
    });
    const result = await invitations.revokeInvitation(context.req.param('id'));
    if (!result.idempotent) {
      await managementStore.appendAuditLog({
        actorId: actor.user.id,
        action: 'member.updated',
        resource: 'member',
        resourceId: result.invitation.id,
        result: 'success',
        source: 'web',
        details: {
          change: 'invitationRevoked',
          invitationId: result.invitation.id,
        },
        requestId: context.get('requestId'),
      });
    }
    return successResponse(context, result.invitation, {
      idempotent: result.idempotent,
    });
  });

  api.post('/invitation-acceptance/resolve', async (context) => {
    await invitationRateLimiter.consumeGlobal(
      invitationRateLimitKey(context, 'resolve'),
    );
    const body = await jsonBody(context);
    rejectUnknownKeys(body, ['token']);
    const token = requiredString(body.token, 'token');
    await invitationRateLimiter.consumeToken('resolve', token);
    return successResponse(context, await invitations.resolveInvitation(token));
  });

  api.post('/invitation-acceptance/accept', async (context) => {
    await invitationRateLimiter.consumeGlobal(
      invitationRateLimitKey(context, 'accept'),
    );
    const body = await jsonBody(context);
    rejectUnknownKeys(body, ['token', 'name', 'username', 'password']);
    const token = requiredString(body.token, 'token');
    await invitationRateLimiter.consumeToken('accept', token);
    const result = await invitations.acceptInvitation({
      token,
      name: requiredString(body.name, 'name'),
      username: requiredString(body.username, 'username'),
      password: requiredUntrimmedString(body.password, 'password'),
    });
    return successResponse(context, result.member, {}, 201);
  });

  api.get('/members', async (context) => {
    const actor = await authenticateActor(context);
    await authorization.require(actor.user.id, {
      resource: 'hub.member',
      action: 'read',
    });
    const result = await managementStore.listMembers(
      readMemberListOptions(context),
    );
    return successResponse(context, result.items, pageMeta(result));
  });

  api.get('/members/:id', async (context) => {
    const actor = await authenticateActor(context);
    await authorization.require(actor.user.id, {
      resource: 'hub.member',
      action: 'read',
    });
    const member = await managementStore.getMember(context.req.param('id'));
    if (!member)
      throw concealedNotFound('MEMBER_NOT_FOUND', context.req.param('id'));
    const response = successResponse(context, member);
    setRevisionEtag(response, member);
    return response;
  });

  api.patch('/members/:id', async (context) => {
    const actor = await authenticateActor(context);
    await authorization.require(actor.user.id, {
      resource: 'hub.member',
      action: 'update',
    });
    const body = await jsonBody(context);
    rejectUnknownKeys(body, ['status']);
    const status = body.status;
    if (status !== 'active' && status !== 'disabled') {
      throw new HubDomainError(
        'VALIDATION_ERROR',
        'status must be active or disabled.',
        { status: 422 },
      );
    }
    const previous = await managementStore.getMember(context.req.param('id'));
    const result = await managementStore.updateMemberStatus(
      context.req.param('id'),
      status,
      requireIfMatchRevision(context),
      actor.user.id,
    );
    if (!result.idempotent) {
      await managementStore.appendAuditLog({
        actorId: actor.user.id,
        action: 'member.updated',
        resource: 'member',
        resourceId: result.member.id,
        result: 'success',
        source: 'web',
        details: {
          change: 'status',
          before: previous?.status ?? null,
          after: result.member.status,
        },
        requestId: context.get('requestId'),
      });
    }
    const response = successResponse(context, result.member, {
      idempotent: result.idempotent,
    });
    setRevisionEtag(response, result.member);
    return response;
  });

  api.get('/members/:id/access', async (context) => {
    const actor = await authenticateActor(context);
    await authorization.require(actor.user.id, {
      resource: 'hub.permission',
      action: 'read',
    });
    const access = await managementStore.getMemberAccess(
      context.req.param('id'),
    );
    const response = successResponse(context, access);
    response.headers.set('etag', `"rev-${access.revision}"`);
    return response;
  });

  api.put('/members/:id/access', async (context) => {
    const actor = await authenticateActor(context);
    await authorization.require(actor.user.id, {
      resource: 'hub.permission',
      action: 'assign',
    });
    const previous = await managementStore.getMemberAccess(
      context.req.param('id'),
    );
    const body = await jsonBody(context);
    const access = parseMemberAccess(body);
    assertOwnerRoleAssignmentAllowed(
      actor,
      access.globalRoles,
      previous.globalRoles,
    );
    const result = await managementStore.replaceMemberAccess(
      context.req.param('id'),
      access,
      requireIfMatchRevision(context),
    );
    await managementStore.appendAuditLog({
      actorId: actor.user.id,
      action: 'permission.updated',
      resource: 'member',
      resourceId: context.req.param('id'),
      result: 'success',
      source: 'web',
      details: {
        before: memberAccessAuditProjection(previous),
        after: memberAccessAuditProjection(result),
      },
      requestId: context.get('requestId'),
    });
    const response = successResponse(context, result);
    response.headers.set('etag', `"rev-${result.revision}"`);
    return response;
  });

  api.get('/apps/:id/access', async (context) => {
    const actor = await authenticateActor(context);
    await requireManagedApplicationAccess(
      managementStore,
      authorization,
      actor.user.id,
      context.req.param('id'),
      'read',
      'hub.permission',
    );
    const result = await managementStore.listApplicationAccess(
      context.req.param('id'),
      readApplicationAccessListOptions(context),
    );
    const response = successResponse(
      context,
      result.items.map((item) => ({
        memberId: item.member.id,
        ...item.member,
        roles: item.roles,
      })),
      pageMeta(result),
    );
    response.headers.set('etag', `"rev-${result.revision}"`);
    return response;
  });

  api.put('/apps/:id/access/:memberId', async (context) => {
    const actor = await authenticateActor(context);
    await requireManagedApplicationAccess(
      managementStore,
      authorization,
      actor.user.id,
      context.req.param('id'),
      'assign',
      'hub.permission',
    );
    const body = await jsonBody(context);
    if (!Array.isArray(body.roles)) {
      throw new HubDomainError('VALIDATION_ERROR', 'roles must be an array.', {
        status: 422,
      });
    }
    const previousAccess = await managementStore.getMemberAccess(
      context.req.param('memberId'),
    );
    const previousRoles =
      previousAccess.applications.find(
        (item) => item.applicationId === context.req.param('id'),
      )?.roles ?? [];
    const result = await managementStore.replaceApplicationMemberAccess(
      context.req.param('id'),
      context.req.param('memberId'),
      body.roles.filter((role): role is string => typeof role === 'string'),
      requireIfMatchRevision(context),
    );
    await managementStore.appendAuditLog({
      actorId: actor.user.id,
      applicationId: context.req.param('id'),
      action: 'permission.updated',
      resource: 'member',
      resourceId: context.req.param('memberId'),
      result: 'success',
      source: 'web',
      details: { before: previousRoles, after: result.roles },
      requestId: context.get('requestId'),
    });
    const response = successResponse(context, result);
    response.headers.set('etag', `"rev-${result.revision}"`);
    return response;
  });

  api.get('/audit-logs', async (context) => {
    const actor = await authenticateActor(context);
    const applicationIds = visibleApplicationIds(actor, 'hub.auditLog', 'read');
    const options = readAuditListOptions(context);
    if (options.applicationId) {
      await requireManagedApplicationAccess(
        managementStore,
        authorization,
        actor.user.id,
        options.applicationId,
        'read',
        'hub.auditLog',
      );
    }
    const result = await managementStore.listAuditLogs({
      ...options,
      applicationIds: constrainApplicationIds(
        applicationIds,
        options.applicationId,
      ),
    });
    return successResponse(context, result.items, pageMeta(result));
  });

  api.get('/audit-logs/:id', async (context) => {
    const actor = await authenticateActor(context);
    const log = await managementStore.getAuditLog(context.req.param('id'));
    if (!log)
      throw new HubDomainError(
        'AUDIT_LOG_NOT_FOUND',
        'Audit log was not found.',
        { status: 404 },
      );
    const canRead = await authorization.can(actor.user.id, {
      resource: 'hub.auditLog',
      action: 'read',
      ...(log.applicationId ? { applicationId: log.applicationId } : {}),
    });
    if (!canRead) {
      throw new HubDomainError(
        'AUDIT_LOG_NOT_FOUND',
        'Audit log was not found.',
        {
          status: 404,
        },
      );
    }
    return successResponse(context, log);
  });

  api.get('/audit-logs.csv', async (context) => {
    const actor = await authenticateActor(context);
    await authorization.require(actor.user.id, {
      resource: 'hub.auditLog',
      action: 'export',
    });
    await auditExportRateLimiter.consume(actor.user.id);
    if (
      context.req.query('limit') !== undefined ||
      context.req.query('offset') !== undefined
    ) {
      throw new HubDomainError(
        'VALIDATION_ERROR',
        'Audit CSV export does not accept limit or offset.',
        { status: 422 },
      );
    }
    const applicationIds = visibleApplicationIds(actor, 'hub.auditLog', 'read');
    const options = readAuditListOptions(context, false);
    if (options.applicationId) {
      await requireManagedApplicationAccess(
        managementStore,
        authorization,
        actor.user.id,
        options.applicationId,
        'read',
        'hub.auditLog',
      );
    }
    const filters: AuditListOptions = {
      ...options,
      applicationIds: constrainApplicationIds(
        applicationIds,
        options.applicationId,
      ),
    };
    const items = [];
    let offset = 0;
    while (items.length <= AUDIT_EXPORT_MAX_ROWS) {
      const page = await managementStore.listAuditLogs({
        ...filters,
        limit: 100,
        offset,
      });
      items.push(...page.items);
      offset += page.items.length;
      if (offset >= page.total || page.items.length === 0) break;
    }
    if (items.length > AUDIT_EXPORT_MAX_ROWS) {
      throw new HubDomainError(
        'EXPORT_LIMIT_EXCEEDED',
        `Audit CSV export exceeds ${AUDIT_EXPORT_MAX_ROWS} rows.`,
        { status: 422 },
      );
    }
    const csv = auditCsv(items);
    return new Response(csv, {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="hub-audit-logs.csv"',
        'cache-control': 'no-store',
      },
    });
  });

  api.get('/settings', async (context) => {
    const actor = await authenticateActor(context);
    await authorization.require(actor.user.id, {
      resource: 'hub.setting',
      action: 'read',
    });
    const settings = await managementStore.getSettings();
    const data = {
      ...settings,
      readOnly: {
        releaseStorage: deps.releaseRoot ? 'local' : 'unavailable',
        hostMode: host.available() ? 'in-process' : 'unavailable',
        environmentCount: 1,
      },
    };
    const response = successResponse(context, data);
    response.headers.set('etag', `"rev-${settings.revision}"`);
    return response;
  });

  api.patch('/settings', async (context) => {
    const actor = await authenticateActor(context);
    await authorization.require(actor.user.id, {
      resource: 'hub.setting',
      action: 'update',
    });
    const body = await jsonBody(context);
    const patch = parseSettingsPatch(body);
    const settings = await managementStore.patchSettings(
      patch,
      requireIfMatchRevision(context),
    );
    await managementStore.appendAuditLog({
      actorId: actor.user.id,
      action: 'settings.updated',
      resource: 'hub',
      result: 'success',
      source: 'web',
      details: { fields: Object.keys(body) },
      requestId: context.get('requestId'),
    });
    const response = successResponse(context, settings);
    response.headers.set('etag', `"rev-${settings.revision}"`);
    return response;
  });

  api.get('/system-info', async (context) => {
    const actor = await authenticateActor(context);
    await authorization.require(actor.user.id, {
      resource: 'hub.setting',
      action: 'read',
    });
    return successResponse(context, {
      hubVersion: deps.appName,
      nodeVersion: process.versions.node,
      databaseType: 'sqlite',
      hostMode: host.available() ? 'in-process' : 'unavailable',
      hostAvailable: host.available(),
      publicBasePath: deps.publicBasePath,
      startedAt: startedAt,
      warnings: runtimeSecrets
        ? []
        : ['Runtime secret encryption is not configured.'],
    });
  });

  api.get('/storage', async (context) => {
    const actor = await authenticateActor(context);
    await authorization.require(actor.user.id, {
      resource: 'hub.setting',
      action: 'read',
    });
    return successResponse(context, await storage.measure());
  });

  api.get('/storage/cleanup-plan', async (context) => {
    const actor = await authenticateActor(context);
    await authorization.require(actor.user.id, {
      resource: 'hub.setting',
      action: 'read',
    });
    const plan = await managementStore.getStorageCleanupPlanData(
      new Date(),
      readPagination(context),
    );
    return successResponse(
      context,
      {
        automaticCleanupEnabled: plan.automaticCleanupEnabled,
        totalReclaimableBytes: plan.totalReclaimableBytes,
        candidates: plan.releaseCandidates.map((item) => ({
          kind: 'release',
          applicationId: item.applicationId,
          resourceId: item.id,
          bytes: item.sizeBytes,
          reason: 'outside retention window',
        })),
        protectedCounts: plan.protectedCounts,
        measuredAt: plan.measuredAt,
      },
      pageMeta(plan),
    );
  });

  api.post('/apps/:id/release-uploads', async (context) => {
    const actor = await authenticateActor(context);
    const applicationId = context.req.param('id');
    await requireManagedApplicationAccess(
      managementStore,
      authorization,
      actor.user.id,
      applicationId,
      'create',
      'hub.release',
    );
    const body = await jsonBody(context);
    const idempotencyKey = requireHeaderIdempotencyKey(context);
    const uploadActor = toReleaseUploadActor(actor);
    const result = await idempotency.execute(
      {
        actorId: actor.user.id,
        credentialId: actor.agent?.credentialId,
        endpoint: 'POST /apps/:id/release-uploads',
        scopeKey: applicationId,
        idempotencyKey,
        payload: body,
      },
      () =>
        requireReleaseUploadService().create(
          applicationId,
          parseReleaseUploadCreateInput(body),
          uploadActor,
        ),
    );
    return successResponse(
      context,
      projectReleaseUpload(
        result.value,
        deps.authoritativeOrigin ?? new URL(context.req.url).origin,
        deps.publicBasePath,
      ),
      { idempotent: result.idempotent },
      result.idempotent ? 200 : 201,
    );
  });

  api.put('/release-uploads/:uploadId/content', async (context) => {
    const actor = await authenticateActor(context);
    const service = requireReleaseUploadService();
    const uploadActor = toReleaseUploadActor(actor);
    const upload = await service.get(
      context.req.param('uploadId'),
      uploadActor,
    );
    await requireManagedApplicationAccess(
      managementStore,
      authorization,
      actor.user.id,
      upload.applicationId,
      'create',
      'hub.release',
    );
    const declaredLength = parseContentLength(
      context.req.header('content-length'),
    );
    const maximum = deps.maxUploadBytes ?? 512 * 1024 * 1024;
    if (declaredLength > maximum) {
      throw new HubDomainError(
        'UPLOAD_ARCHIVE_TOO_LARGE',
        'Uploaded archive exceeds the maximum size.',
        { status: 413 },
      );
    }
    const content = new Uint8Array(await context.req.raw.arrayBuffer());
    if (content.byteLength !== declaredLength) {
      throw new HubDomainError(
        'UPLOAD_CONTENT_LENGTH_MISMATCH',
        'Uploaded bytes do not match Content-Length.',
        { status: 422 },
      );
    }
    await service.putContent(upload.id, uploadActor, content);
    return new Response(null, { status: 204 });
  });

  api.post('/release-uploads/:uploadId/complete', async (context) => {
    const actor = await authenticateActor(context);
    const body = await jsonBody(context);
    rejectUnknownKeys(body, []);
    const service = requireReleaseUploadService();
    const uploadActor = toReleaseUploadActor(actor);
    const upload = await service.get(
      context.req.param('uploadId'),
      uploadActor,
    );
    await requireManagedApplicationAccess(
      managementStore,
      authorization,
      actor.user.id,
      upload.applicationId,
      'create',
      'hub.release',
    );
    const result = await service.startCompletion(upload.id, uploadActor);
    const terminal =
      result.upload.status === 'completed' || result.upload.status === 'failed';
    return successResponse(
      context,
      result.upload,
      { idempotent: result.idempotent },
      terminal ? 200 : 202,
    );
  });

  api.get('/release-uploads/:uploadId', async (context) => {
    const actor = await authenticateActor(context);
    const service = requireReleaseUploadService();
    const upload = await service.get(
      context.req.param('uploadId'),
      toReleaseUploadActor(actor),
    );
    await requireManagedApplicationAccess(
      managementStore,
      authorization,
      actor.user.id,
      upload.applicationId,
      'create',
      'hub.release',
    );
    return successResponse(context, upload);
  });

  api.delete('/release-uploads/:uploadId', async (context) => {
    const actor = await authenticateActor(context);
    const service = requireReleaseUploadService();
    const uploadActor = toReleaseUploadActor(actor);
    const upload = await service.get(
      context.req.param('uploadId'),
      uploadActor,
    );
    await requireManagedApplicationAccess(
      managementStore,
      authorization,
      actor.user.id,
      upload.applicationId,
      'create',
      'hub.release',
    );
    const result = await service.cancel(upload.id, uploadActor);
    return successResponse(context, result.upload, {
      idempotent: result.idempotent,
    });
  });

  api.get('/apps/:id/releases', async (context) => {
    const actor = await authenticateActor(context);
    const applicationId = context.req.param('id');
    if (managementEnabled) {
      await requireManagedApplicationAccess(
        managementStore,
        authorization,
        actor.user.id,
        applicationId,
        'read',
        'hub.release',
      );
      const result = await managementStore.listReleases(
        applicationId,
        readReleaseListOptions(context),
      );
      return successResponse(context, result.items, pageMeta(result));
    }
    await requireAuthorizedApplication(
      store,
      authorization,
      actor.user.id,
      applicationId,
      'read',
      'hub.release',
    );
    const result = await store.listReleases(
      applicationId,
      readPagination(context),
    );
    return successResponse(context, result.items, pageMeta(result));
  });

  api.get('/apps/:id/releases/:releaseId', async (context) => {
    const actor = await authenticateActor(context);
    const applicationId = context.req.param('id');
    await requireManagedApplicationAccess(
      managementStore,
      authorization,
      actor.user.id,
      applicationId,
      'read',
      'hub.release',
    );
    const release = await managementStore.getRelease(
      applicationId,
      context.req.param('releaseId'),
    );
    if (!release) {
      throw new HubDomainError('RELEASE_NOT_FOUND', 'Release was not found.', {
        status: 404,
      });
    }
    return successResponse(context, release);
  });

  api.post('/apps/:id/releases/:releaseId/pin', async (context) => {
    const actor = await authenticateActor(context);
    const applicationId = context.req.param('id');
    await requireManagedApplicationAccess(
      managementStore,
      authorization,
      actor.user.id,
      applicationId,
      'update',
      'hub.release',
    );
    const body = await jsonBody(context);
    rejectUnknownKeys(body, []);
    const result = await managementStore.pinRelease(
      applicationId,
      context.req.param('releaseId'),
      actor.user.id,
    );
    if (!result.idempotent) {
      await managementStore.appendAuditLog({
        actorId: actor.user.id,
        applicationId,
        action: 'release.pinned',
        resource: 'release',
        resourceId: result.release.id,
        result: 'success',
        source: 'web',
        details: { version: result.release.version },
        requestId: context.get('requestId'),
      });
    }
    return successResponse(context, result.release, {
      idempotent: result.idempotent,
    });
  });

  api.post('/apps/:id/releases/:releaseId/unpin', async (context) => {
    const actor = await authenticateActor(context);
    const applicationId = context.req.param('id');
    await requireManagedApplicationAccess(
      managementStore,
      authorization,
      actor.user.id,
      applicationId,
      'update',
      'hub.release',
    );
    const body = await jsonBody(context);
    rejectUnknownKeys(body, []);
    const result = await managementStore.unpinRelease(
      applicationId,
      context.req.param('releaseId'),
    );
    if (!result.idempotent) {
      await managementStore.appendAuditLog({
        actorId: actor.user.id,
        applicationId,
        action: 'release.unpinned',
        resource: 'release',
        resourceId: result.release.id,
        result: 'success',
        source: 'web',
        details: { version: result.release.version },
        requestId: context.get('requestId'),
      });
    }
    return successResponse(context, result.release, {
      idempotent: result.idempotent,
    });
  });

  api.get('/apps/:id/deployments', async (context) => {
    const actor = await authenticateActor(context);
    const applicationId = context.req.param('id');
    await requireAuthorizedApplication(
      store,
      authorization,
      actor.user.id,
      applicationId,
      'read',
      'hub.deployment',
    );
    const result = await store.listDeployments({
      ...readDeploymentListOptions(context, false),
      applicationId,
    });
    return successResponse(
      context,
      result.items.map(projectDeployment),
      pageMeta(result),
    );
  });

  api.post('/apps/:id/deployments', async (context) => {
    const actor = await authenticateActor(context);
    const applicationId = context.req.param('id');
    const body = await jsonBody(context);
    rejectUnknownKeys(body, ['targetReleaseId', 'type']);
    const type = deploymentType(body.type);
    if (
      actor.agent &&
      !actor.agent.scopes.includes(deploymentAgentScope(type))
    ) {
      throw new HubDomainError(
        'INSUFFICIENT_SCOPE',
        'Agent credentials cannot perform this deployment operation.',
        { status: 403 },
      );
    }
    await requireAuthorizedApplication(
      store,
      authorization,
      actor.user.id,
      applicationId,
      type,
      'hub.deployment',
    );
    const targetReleaseId = requiredString(
      body.targetReleaseId,
      'targetReleaseId',
    );
    const idempotencyKey = requireHeaderIdempotencyKey(context);
    const result = await store.createDeployment(
      applicationId,
      {
        targetReleaseId,
        type,
        idempotencyKey: internalDeploymentIdempotencyKey(actor, idempotencyKey),
      } satisfies CreateDeploymentInput,
      actor.user.id,
    );
    if (result.created) {
      await managementStore.appendAuditLog({
        actorId: actor.user.id,
        applicationId,
        action: 'deployment.requested',
        resource: 'deployment',
        resourceId: result.deployment.id,
        result: 'success',
        source: actor.agent ? 'agent' : 'web',
        client: actor.agent
          ? {
              credentialId: actor.agent.credentialId,
              name: actor.agent.clientName,
            }
          : null,
        details: {
          type,
          targetReleaseId,
        },
        requestId: context.get('requestId'),
      });
      void coordinator.schedule(result.deployment);
    }
    return successResponse(
      context,
      projectDeployment(result.deployment),
      { idempotent: !result.created },
      !result.created && isTerminalDeployment(result.deployment) ? 200 : 202,
    );
  });

  api.get('/deployments', async (context) => {
    const actor = await authenticateActor(context);
    const applicationIds = visibleApplicationIds(
      actor,
      'hub.deployment',
      'read',
    );
    const options = readDeploymentListOptions(context, true);
    if (options.applicationId) {
      if (
        (applicationIds !== undefined &&
          !applicationIds.includes(options.applicationId)) ||
        (actor.agent &&
          !agentApplicationScopeAllows(actor.agent, options.applicationId))
      ) {
        throw concealedNotFound('APPLICATION_NOT_FOUND', options.applicationId);
      }
      await requireAuthorizedApplication(
        store,
        authorization,
        actor.user.id,
        options.applicationId,
        'read',
        'hub.deployment',
      );
    }
    const result = await store.listDeployments({
      ...options,
      applicationIds,
    });
    return successResponse(
      context,
      result.items.map(projectDeployment),
      pageMeta(result),
    );
  });

  api.get('/deployments.csv', async (context) => {
    const actor = await authenticateActor(context);
    if (
      context.req.query('limit') !== undefined ||
      context.req.query('offset') !== undefined
    ) {
      throw new HubDomainError(
        'VALIDATION_ERROR',
        'Deployment CSV export does not accept limit or offset.',
        { status: 422 },
      );
    }
    await deploymentExportRateLimiter.consume(actor.user.id);
    const applicationIds = visibleApplicationIds(
      actor,
      'hub.deployment',
      'read',
    );
    const options = readDeploymentListOptions(context, true, false);
    if (options.applicationId) {
      if (
        (applicationIds !== undefined &&
          !applicationIds.includes(options.applicationId)) ||
        (actor.agent &&
          !agentApplicationScopeAllows(actor.agent, options.applicationId))
      ) {
        throw concealedNotFound('APPLICATION_NOT_FOUND', options.applicationId);
      }
      await requireAuthorizedApplication(
        store,
        authorization,
        actor.user.id,
        options.applicationId,
        'read',
        'hub.deployment',
      );
    }
    const filters: DeploymentListOptions = {
      ...options,
      applicationIds,
    };
    const firstPage = await store.listDeployments({
      ...filters,
      limit: 100,
      offset: 0,
    });
    if (firstPage.total > DEPLOYMENT_EXPORT_MAX_ROWS) {
      throw new HubDomainError(
        'EXPORT_LIMIT_EXCEEDED',
        `Deployment CSV export exceeds ${DEPLOYMENT_EXPORT_MAX_ROWS} rows.`,
        { status: 422 },
      );
    }
    const items = [...firstPage.items];
    while (items.length < firstPage.total) {
      const page = await store.listDeployments({
        ...filters,
        limit: 100,
        offset: items.length,
      });
      items.push(...page.items);
      if (page.items.length === 0) break;
    }
    const references = await loadDeploymentCsvReferences(deps.database, items);
    return new Response(deploymentCsv(items, references), {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="hub-deployments.csv"',
        'cache-control': 'no-store',
      },
    });
  });

  api.get('/deployments/:id/events', async (context) => {
    const actor = await authenticateActor(context);
    const deployment = await requireAuthorizedDeployment(
      store,
      authorization,
      actor,
      context.req.param('id'),
    );
    return successResponse(
      context,
      await store.listDeploymentEvents(deployment.id),
    );
  });

  api.get('/deployments/:id', async (context) => {
    const actor = await authenticateActor(context);
    const deployment = await requireAuthorizedDeployment(
      store,
      authorization,
      actor,
      context.req.param('id'),
    );
    return successResponse(context, projectDeployment(deployment));
  });

  ready = ready.then(async (): Promise<void> => {
    await idempotency.recoverRunning();
    const service = runtimeSecrets;
    if (service) {
      for (const pending of await service.listPending()) {
        await controlLocks.run(
          pending.applicationId,
          async (): Promise<void> => {
            const application = await requireCurrentManagedApplication(
              managementStore,
              pending.applicationId,
            );
            try {
              const summary = await convergeRuntimeSecretRotation({
                application,
                pending,
                operationId: requireRotationOperationId(pending),
                store,
                host,
                service,
              });
              await appendRuntimeSecretAudit({
                managementStore,
                actorId: null,
                applicationId: pending.applicationId,
                action: 'runtimeSecret.rotated',
                result: 'success',
                source: 'system',
                operationId: requireRotationOperationId(pending),
                version: summary.version,
              });
            } catch (error) {
              throw new HubDomainError(
                'RUNTIME_SECRET_RECOVERY_FAILED',
                'A pending runtime secret rotation could not be recovered.',
                { status: 500, retryable: true, cause: error },
              );
            }
          },
        );
      }
    }
    if (options.recoverDeployments !== false) {
      await coordinator.recover();
    }
    if (releaseUploads && runtimeSecrets) {
      defaultApplicationBootstrap = new DefaultApplicationBootstrap({
        connection: deps.database.connection,
        store,
        managementStore,
        runtimeSecrets,
        releaseUploads,
        host,
        resourcesDirectory:
          deps.defaultAppResourcesDirectory ??
          deps.releaseRoot ??
          process.cwd(),
        scheduleDeployment: (deployment) => coordinator.schedule(deployment),
        appName: deps.appName,
      });
    }
    if (options.recoverDeployments !== false) {
      await coordinator.reconcileActiveRuntimes();
    }
  });
  Object.defineProperties(api, {
    ready: { configurable: false, enumerable: false, value: ready },
    close: {
      configurable: false,
      enumerable: false,
      value: async (): Promise<void> => {
        await coordinator.drain();
        await rateLimitCaching.dispose();
      },
    },
  });

  async function withSetupLock<T>(operation: () => Promise<T>): Promise<T> {
    const previous = setupTail;
    let release!: () => void;
    setupTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  return api;
}

function agentApplicationScopeAllows(
  principal: AgentPrincipal,
  applicationId: string,
): boolean {
  return (
    principal.applicationScope.mode === 'all-authorized' ||
    principal.applicationScope.applicationIds.includes(applicationId)
  );
}

class HubRateLimitError extends HubDomainError {
  readonly retryAfterSeconds: number;

  constructor(message: string, retryAfterSeconds: number) {
    super('RATE_LIMITED', message, {
      status: 429,
      retryable: true,
    });
    this.name = 'HubRateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

class InvitationRateLimitError extends HubRateLimitError {
  constructor(retryAfterSeconds: number) {
    super('Too many invitation acceptance requests.', retryAfterSeconds);
    this.name = 'InvitationRateLimitError';
  }
}

class InvitationRateLimiter {
  constructor(private readonly counter: Counter) {}

  async consumeGlobal(key: string): Promise<void> {
    await this.consume(`global:${key}`, INVITATION_GLOBAL_RATE_LIMIT);
  }

  async consumeToken(
    operation: 'resolve' | 'accept',
    token: string,
  ): Promise<void> {
    const digest = createHash('sha256').update(token).digest('hex');
    await this.consume(
      `token:${operation}:${digest}`,
      INVITATION_TOKEN_RATE_LIMIT,
    );
  }

  private async consume(key: string, limit: number): Promise<void> {
    const count = await this.counter.increment(
      key,
      1,
      INVITATION_RATE_LIMIT_WINDOW_MS,
    );
    if (count > limit) {
      throw new InvitationRateLimitError(
        Math.ceil(INVITATION_RATE_LIMIT_WINDOW_MS / 1_000),
      );
    }
  }
}

class AuditExportRateLimiter {
  constructor(private readonly counter: Counter) {}

  async consume(userId: string): Promise<void> {
    const count = await this.counter.increment(
      `user:${userId}`,
      1,
      AUDIT_EXPORT_RATE_LIMIT_WINDOW_MS,
    );
    if (count > AUDIT_EXPORT_RATE_LIMIT) {
      throw new HubRateLimitError(
        'Too many audit export requests.',
        Math.ceil(AUDIT_EXPORT_RATE_LIMIT_WINDOW_MS / 1_000),
      );
    }
  }
}

class DeploymentExportRateLimiter {
  constructor(private readonly counter: Counter) {}

  async consume(userId: string): Promise<void> {
    const count = await this.counter.increment(
      `user:${userId}`,
      1,
      DEPLOYMENT_EXPORT_RATE_LIMIT_WINDOW_MS,
    );
    if (count > DEPLOYMENT_EXPORT_RATE_LIMIT) {
      throw new HubRateLimitError(
        'Too many deployment export requests.',
        Math.ceil(DEPLOYMENT_EXPORT_RATE_LIMIT_WINDOW_MS / 1_000),
      );
    }
  }
}

function invitationRateLimitKey(
  context: HubContext,
  operation: 'resolve' | 'accept',
): string {
  let remoteAddress = 'unknown';
  try {
    remoteAddress = getConnInfo(context).remote.address ?? 'unknown';
  } catch {
    // Hono's in-process test/runtime adapter does not provide connection info.
  }
  const origin = parseOrigin(context.req.header('origin')) ?? 'no-origin';
  return createHash('sha256')
    .update(`${operation}\0${remoteAddress}\0${origin}`)
    .digest('hex');
}

function roleDisplayName(role: string): string {
  const names: Readonly<Record<string, string>> = {
    owner: 'Owner',
    admin: 'Administrator',
    developer: 'Developer',
    deployer: 'Deployer',
    viewer: 'Viewer',
  };
  return names[role] ?? role;
}

function groupRoleCapabilities(
  values: readonly string[],
): Array<{ resource: string; actions: string[] }> {
  const grouped = new Map<string, string[]>();
  for (const value of values) {
    const separator = value.lastIndexOf(':');
    if (separator <= 0 || separator === value.length - 1) continue;
    const resource = value.slice(0, separator);
    const action = value.slice(separator + 1);
    const actions = grouped.get(resource) ?? [];
    if (!actions.includes(action)) actions.push(action);
    grouped.set(resource, actions);
  }
  return [...grouped].map(([resource, actions]) => ({ resource, actions }));
}

function invitationAcceptanceUrl(
  context: HubContext,
  deps: Pick<HubApiDeps, 'authoritativeOrigin' | 'publicBasePath'>,
): string {
  const origin = deps.authoritativeOrigin
    ? new URL(deps.authoritativeOrigin).origin
    : new URL(context.req.url).origin;
  return new URL(
    `${normalizePath(deps.publicBasePath)}/invitation-acceptance`,
    `${origin}/`,
  ).toString();
}

function withoutInviteUrl(invitation: CreatedInvitation): ManagedInvitation {
  const { inviteUrl: _inviteUrl, ...managed } = invitation;
  return managed;
}

class DeploymentCoordinator {
  private readonly running = new Map<string, Promise<void>>();

  constructor(
    private readonly store: HubStore,
    private readonly managementStore: HubManagementStore,
    private readonly host: LocalHostAdapter,
    private readonly runtimeSecretProvider: () =>
      RuntimeSecretService | undefined,
    private readonly controlLocks: ApplicationControlLocks,
  ) {}

  schedule(deployment: HubDeployment): Promise<void> {
    const existing = this.running.get(deployment.applicationId);
    if (existing) return existing;
    const operation = this.run(deployment).finally(() => {
      if (this.running.get(deployment.applicationId) === operation) {
        this.running.delete(deployment.applicationId);
      }
    });
    this.running.set(deployment.applicationId, operation);
    return operation;
  }

  async recover(): Promise<void> {
    const deployments = await this.store.listUnfinishedDeployments();
    const operations: Promise<void>[] = [];
    for (const deployment of deployments) {
      const application = await this.store.requireApplication(
        deployment.applicationId,
      );
      if (
        (application.activeReleaseId === deployment.targetReleaseId &&
          deployment.previousReleaseId !== deployment.targetReleaseId) ||
        deployment.hostOperationId === deployment.id
      ) {
        operations.push(this.convergeRecoveredDeployment(deployment));
        continue;
      }
      if (deployment.status === 'queued' || deployment.status === 'preparing') {
        operations.push(this.schedule(deployment));
        continue;
      }
      const message =
        'Hub restarted after the Host operation began; deployment outcome cannot be proven safely.';
      await this.store.updateDeployment(deployment.id, {
        status: 'failed',
        finishedAt: new Date().toISOString(),
        failureCode: 'HUB_RESTARTED_DURING_DEPLOYMENT',
        failureMessage: message,
      });
      await this.store.appendDeploymentEvent(deployment.id, {
        type: 'failed',
        status: 'failed',
        message,
        details: { code: 'HUB_RESTARTED_DURING_DEPLOYMENT' },
      });
      await this.appendOutcomeAudit(
        deployment,
        'deployment.failed',
        'failure',
        'HUB_RESTARTED_DURING_DEPLOYMENT',
      );
    }
    await Promise.all(operations);
  }

  async reconcileActiveRuntimes(): Promise<void> {
    if (!this.host.available()) return;
    const active = await this.store.listActiveApplicationReleases();
    for (const projection of active) {
      if (this.running.has(projection.application.id)) continue;
      const runtimeSecretService = this.runtimeSecretProvider();
      const runtimeSecret = runtimeSecretService
        ? await runtimeSecretService.getActive(projection.application.id)
        : undefined;
      if (projection.application.desiredRuntimeState === 'running') {
        await this.host.restore(
          projection.application,
          projection.release,
          runtimeSecret?.secret,
        );
      } else if (runtimeSecret) {
        await this.host.prepare(
          projection.application,
          projection.release,
          runtimeSecret.secret,
          false,
        );
      } else {
        throw new HubDomainError(
          'RUNTIME_SECRET_NOT_CONFIGURED',
          'The application runtime secret is not configured.',
          { status: 500 },
        );
      }
      if (runtimeSecretService && runtimeSecret) {
        await runtimeSecretService.markInjected(
          projection.application.id,
          runtimeSecret.version,
        );
      }
    }
  }

  async drain(): Promise<void> {
    await Promise.allSettled([...this.running.values()]);
  }

  private async run(deployment: HubDeployment): Promise<void> {
    let result: AppDeploymentResult;
    const run = async (): Promise<void> => {
      try {
        await this.transition(
          deployment,
          'preparing',
          'preparing',
          'Preparing release.',
        );
        const application = await this.store.requireApplication(
          deployment.applicationId,
        );
        const release = await this.store.getRelease(deployment.targetReleaseId);
        if (!release)
          throw new HubDomainError(
            'RELEASE_NOT_FOUND',
            'Deployment release was removed.',
            { status: 404 },
          );
        if (deployment.previousReleaseId) {
          const previousRelease = await this.store.getRelease(
            deployment.previousReleaseId,
          );
          if (!previousRelease) {
            throw new HubDomainError(
              'PREVIOUS_RELEASE_NOT_FOUND',
              'The previous active release required for deployment recovery was not found.',
              { status: 500 },
            );
          }
          await this.host.restore(application, previousRelease);
        }
        await this.transition(
          deployment,
          'activating',
          'activating',
          'Activating release.',
        );
        const runtimeSecret = this.runtimeSecretProvider()
          ? await this.runtimeSecretProvider()!.getActive(application.id)
          : undefined;
        result = await this.host.deploy({
          application,
          release,
          deployment,
          runtimeSecret: runtimeSecret?.secret,
        });
      } catch (error) {
        await this.failDeployment(deployment, error);
        return;
      }

      let progressRecorded = false;
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        try {
          if (!progressRecorded) {
            await this.recordPostHostProgress(deployment, result);
            progressRecorded = true;
          }
          await this.store.completeDeploymentSuccess(deployment.id, {
            hostOperationId: result.operationId,
            runtimeId: result.app.id,
            recovered: false,
          });
          await this.appendOutcomeAudit(
            deployment,
            'deployment.succeeded',
            'success',
          );
          return;
        } catch (error) {
          logServerError(error, {
            operation: 'deployment-control-plane-commit',
            deploymentId: deployment.id,
            attempt,
            hostOperationId: result.operationId,
          });
        }
      }
    };
    await this.controlLocks.run(deployment.applicationId, run);
  }

  private async recordPostHostProgress(
    deployment: HubDeployment,
    result: AppDeploymentResult,
  ): Promise<void> {
    await this.transition(
      deployment,
      'checking',
      'checking',
      'Checking runtime readiness.',
      result,
    );
    await this.transition(
      deployment,
      'switching',
      'switching',
      'Switching active release.',
      result,
    );
    await this.transition(
      deployment,
      'draining',
      'draining',
      'Draining previous runtime.',
      result,
    );
  }

  private async convergeRecoveredDeployment(
    deployment: HubDeployment,
  ): Promise<void> {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        await this.store.completeDeploymentSuccess(deployment.id, {
          hostOperationId: deployment.hostOperationId,
          recovered: true,
        });
        await this.appendOutcomeAudit(
          deployment,
          'deployment.succeeded',
          'success',
        );
        return;
      } catch (error) {
        logServerError(error, {
          operation: 'deployment-recovery-commit',
          deploymentId: deployment.id,
          attempt,
        });
      }
    }
  }

  private async failDeployment(
    deployment: HubDeployment,
    error: unknown,
  ): Promise<void> {
    const domainError = toDomainError(error);
    logServerError(error, {
      operation: 'deployment',
      deploymentId: deployment.id,
      code: domainError.code,
    });
    await this.store
      .updateDeployment(deployment.id, {
        status: 'failed',
        finishedAt: new Date().toISOString(),
        failureCode: domainError.code,
        failureMessage: domainError.message,
      })
      .catch(() => undefined);
    await this.store
      .appendDeploymentEvent(deployment.id, {
        type: 'failed',
        status: 'failed',
        message: domainError.message,
        details: { code: domainError.code },
      })
      .catch(() => undefined);
    await this.appendOutcomeAudit(
      deployment,
      'deployment.failed',
      'failure',
      domainError.code,
    ).catch(() => undefined);
  }

  private async appendOutcomeAudit(
    deployment: HubDeployment,
    action: 'deployment.succeeded' | 'deployment.failed',
    result: 'success' | 'failure',
    failureCode?: string,
  ): Promise<void> {
    const existing = await this.managementStore.listAuditLogs({
      action,
      resourceId: deployment.id,
      limit: 1,
    });
    if (existing.total > 0) return;
    await this.managementStore.appendAuditLog({
      actorId: deployment.requestedBy,
      applicationId: deployment.applicationId,
      action,
      resource: 'deployment',
      resourceId: deployment.id,
      result,
      source: 'system',
      failureCode: failureCode ?? null,
      details: {
        type: deployment.type,
        targetReleaseId: deployment.targetReleaseId,
      },
    });
  }

  private async transition(
    deployment: HubDeployment,
    status: HubDeployment['status'],
    type: string,
    message: string,
    result?: AppDeploymentResult,
  ): Promise<void> {
    await this.store.updateDeployment(deployment.id, {
      status,
      startedAt: deployment.startedAt ?? new Date().toISOString(),
      hostOperationId: result?.operationId,
    });
    await this.store.appendDeploymentEvent(deployment.id, {
      type,
      status,
      message,
      runtimeId: result?.app.id,
      details: result ? { activeReleaseId: result.activeReleaseId } : {},
    });
  }
}

class ApplicationControlLocks {
  private readonly tails = new Map<string, Promise<void>>();

  async run<T>(applicationId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(applicationId) ?? Promise.resolve();
    let release!: () => void;
    const tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.tails.set(applicationId, tail);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.tails.get(applicationId) === tail) {
        this.tails.delete(applicationId);
      }
    }
  }
}

interface CreateManagedApplicationDeps {
  readonly body: Record<string, unknown>;
  readonly actor: AuthorizedHubActor;
  readonly store: HubStore;
  readonly managementStore: HubManagementStore;
  readonly runtimeSecrets: RuntimeSecretService;
}

async function createManagedApplication(
  deps: CreateManagedApplicationDeps,
): Promise<ManagedApplication> {
  rejectUnknownKeys(deps.body, ['slug', 'name', 'description']);
  const input = {
    slug: requiredString(deps.body.slug, 'slug'),
    name: requiredString(deps.body.name, 'name'),
    description: nullableOptionalString(deps.body.description, 'description'),
  } satisfies CreateApplicationInput;
  assertApplicationSlugNotReserved(input.slug);
  const applicationId = crypto.randomUUID();
  let applicationCreated = false;
  try {
    await deps.store.connection.transaction(async (connection) => {
      const transactionalStore = new HubStore(connection);
      const transactionalManagement = new HubManagementStore(connection, {
        roles: HUB_ROLE_DEFINITIONS,
      });
      await transactionalStore.createApplication(input, deps.actor.user.id, {
        id: applicationId,
      });
      applicationCreated = true;
      await deps.runtimeSecrets
        .withConnection(connection)
        .ensureInitial(applicationId);
      await transactionalManagement.appendAuditLog({
        actorId: deps.actor.user.id,
        applicationId,
        action: 'application.created',
        resource: 'application',
        resourceId: applicationId,
        result: 'success',
        source: 'web',
        details: { slug: input.slug },
      });
    });
  } catch (error) {
    if (applicationCreated) {
      await cleanupIncompleteManagedApplication(deps.store, applicationId);
    }
    throw error;
  }
  const application = await deps.managementStore.getApplication(applicationId);
  if (!application) {
    throw new HubDomainError(
      'APPLICATION_CREATION_INCOMPLETE',
      'The application could not be created completely.',
      { status: 500, retryable: true },
    );
  }
  return application;
}

async function cleanupIncompleteManagedApplication(
  store: HubStore,
  applicationId: string,
): Promise<void> {
  await store.connection
    .transaction(async (connection) => {
      const releases = await connection.query
        .selectFrom('hubReleases')
        .select('id')
        .where('applicationId', '=', applicationId)
        .execute<{ id: string }>();
      if (releases.length > 0) {
        await connection.query
          .deleteFrom('hubReleaseRetentions')
          .where(
            'releaseId',
            'in',
            releases.map((release) => release.id),
          )
          .execute();
      }
      await connection.query
        .deleteFrom('hubReleaseUploads')
        .where('applicationId', '=', applicationId)
        .execute();
      await connection.query
        .deleteFrom('hubReleases')
        .where('applicationId', '=', applicationId)
        .execute();
      await connection.query
        .deleteFrom('hubRuntimeSecrets')
        .where('applicationId', '=', applicationId)
        .execute();
      await connection.query
        .deleteFrom('hubAuditLogs')
        .where('applicationId', '=', applicationId)
        .execute();
      await connection.query
        .deleteFrom('hubApplications')
        .where('id', '=', applicationId)
        .execute();
    })
    .catch(() => undefined);
}

async function requireManagedApplicationAccess(
  managementStore: HubManagementStore,
  authorization: HubAuthorization,
  userId: string,
  applicationId: string,
  action: HubAction,
  resource: HubResource = 'hub.app',
): Promise<ManagedApplication> {
  const [allowed, application] = await Promise.all([
    authorization.can(userId, { resource, action, applicationId }),
    managementStore.getApplication(applicationId),
  ]);
  if (!allowed || !application) {
    throw concealedNotFound('APPLICATION_NOT_FOUND', applicationId);
  }
  return application;
}

async function requireCurrentManagedApplication(
  managementStore: HubManagementStore,
  applicationId: string,
): Promise<ManagedApplication> {
  const application = await managementStore.getApplication(applicationId);
  if (!application) {
    throw concealedNotFound('APPLICATION_NOT_FOUND', applicationId);
  }
  return application;
}

function assertRuntimeControlApplication(
  application: ManagedApplication,
): void {
  if (application.status === 'archived') {
    throw new HubDomainError(
      'APPLICATION_ARCHIVED',
      'Archived applications cannot be controlled.',
      { status: 409 },
    );
  }
}

async function assertRuntimeControlAvailable(
  store: HubStore,
  applicationId: string,
): Promise<void> {
  const deployments = await store.listUnfinishedDeployments();
  if (
    deployments.some((deployment) => deployment.applicationId === applicationId)
  ) {
    throw new HubDomainError(
      'RUNTIME_CONTROL_CONFLICT',
      'A deployment is already running for this application.',
      { status: 409, retryable: true },
    );
  }
}

function assertRuntimeReleaseMatches(
  application: ManagedApplication,
  snapshot: AppSnapshot,
): void {
  if (snapshot.releaseId !== application.activeReleaseId) {
    throw new HubDomainError(
      'ACTIVE_RELEASE_CHANGED',
      'The active runtime release no longer matches the application.',
      { status: 409, retryable: true },
    );
  }
}

function assertRuntimeSnapshotControllable(
  snapshot: AppSnapshot | undefined,
): void {
  if (snapshot && snapshot.state !== 'active') {
    throw new HubDomainError(
      'RUNTIME_CONTROL_CONFLICT',
      'The application runtime is already changing state.',
      { status: 409, retryable: true },
    );
  }
}

function runtimeControlOperationId(
  actor: AuthenticatedHubActor,
  applicationId: string,
  operation: 'restart' | 'secret',
  idempotencyKey: string,
): string {
  const identity = actor.agent
    ? `credential:${actor.agent.credentialId}`
    : `actor:${actor.user.id}`;
  const digest = createHash('sha256')
    .update(`${identity}\0${applicationId}\0${idempotencyKey}`)
    .digest('hex');
  return operation === 'secret'
    ? `runtime-secret-${digest}`
    : `runtime-restart-${digest}`;
}

interface RuntimeSecretConvergenceOptions {
  readonly application: ManagedApplication;
  readonly pending: ActiveRuntimeSecret;
  readonly operationId: string;
  readonly store: HubStore;
  readonly host: LocalHostAdapter;
  readonly service: RuntimeSecretService;
}

async function convergeRuntimeSecretRotation(
  options: RuntimeSecretConvergenceOptions,
): Promise<RuntimeSecretSummary> {
  const current = options.host.getRuntime(
    toHubApplication(options.application),
  );
  assertRuntimeSnapshotControllable(current);
  if (current) {
    const release = await getActiveRelease(options.store, options.application);
    assertRuntimeReleaseMatches(options.application, current);
    if (options.application.desiredRuntimeState === 'stopped') {
      await options.host.deactivate(
        toHubApplication(options.application),
        release,
        options.pending.secret,
      );
    } else {
      await options.host.restart(
        toHubApplication(options.application),
        release,
        options.pending.secret,
        options.operationId,
      );
    }
    return options.service.activatePending(
      options.application.id,
      options.operationId,
      true,
    );
  }

  if (options.application.activeReleaseId) {
    const release = await getActiveRelease(options.store, options.application);
    await options.host.prepare(
      toHubApplication(options.application),
      release,
      options.pending.secret,
      options.application.desiredRuntimeState === 'running',
    );
    return options.service.activatePending(
      options.application.id,
      options.operationId,
      true,
    );
  }

  return options.service.activatePending(
    options.application.id,
    options.operationId,
    false,
  );
}

interface RuntimeSecretAuditOptions {
  readonly managementStore: HubManagementStore;
  readonly actorId: string | null;
  readonly applicationId: string;
  readonly action: 'runtimeSecret.rotated' | 'runtimeSecret.rotationFailed';
  readonly result: 'success' | 'failure';
  readonly source?: 'web' | 'system';
  readonly operationId: string;
  readonly version?: number;
  readonly failureCode?: string;
  readonly requestId?: string;
}

async function appendRuntimeSecretAudit(
  options: RuntimeSecretAuditOptions,
): Promise<void> {
  const existing = await options.managementStore.listAuditLogs({
    applicationId: options.applicationId,
    action: options.action,
    resource: 'runtimeSecret',
    resourceId: options.applicationId,
    limit: 100,
  });
  if (
    existing.items.some(
      (item) => item.details.operationId === options.operationId,
    )
  ) {
    return;
  }
  await options.managementStore.appendAuditLog({
    actorId: options.actorId,
    applicationId: options.applicationId,
    action: options.action,
    resource: 'runtimeSecret',
    resourceId: options.applicationId,
    result: options.result,
    source: options.source ?? 'web',
    failureCode: options.failureCode ?? null,
    details: {
      operationId: options.operationId,
      ...(options.version === undefined ? {} : { version: options.version }),
    },
    requestId: options.requestId,
  });
}

function requireRotationOperationId(secret: ActiveRuntimeSecret): string {
  if (!secret.operationId) {
    throw new HubDomainError(
      'RUNTIME_SECRET_ROTATION_STATE_CONFLICT',
      'The pending runtime secret rotation has no operation identifier.',
      { status: 500 },
    );
  }
  return secret.operationId;
}

function toHubApplication(application: ManagedApplication): HubApplication {
  return {
    id: application.id,
    slug: application.slug,
    name: application.name,
    description: application.description,
    status: application.status,
    desiredRuntimeState: application.desiredRuntimeState,
    defaultEnvironmentId: application.defaultEnvironmentId,
    activeReleaseId: application.activeReleaseId,
    createdBy: application.createdBy,
    createdAt: application.createdAt,
    updatedAt: application.updatedAt,
  };
}

function projectRuntime(
  application: ManagedApplication,
  snapshot: AppSnapshot | undefined,
  appPublicOrigin: string | undefined,
): Record<string, unknown> {
  const openUrl =
    application.status === 'active' &&
    application.desiredRuntimeState === 'running' &&
    application.activeReleaseId
      ? applicationOpenUrl(application.slug, appPublicOrigin)
      : null;
  if (!snapshot) {
    return {
      applicationId: application.id,
      environmentId: application.defaultEnvironmentId,
      runtimeId: null,
      state: applicationRuntimeState(application, snapshot),
      health: 'unknown',
      releaseId: application.activeReleaseId,
      url: openUrl,
      startedAt: null,
      lastSeenAt: null,
      lastCheckedAt: null,
      activeRequests: 0,
      failure: null,
    };
  }
  return {
    applicationId: application.id,
    environmentId: application.defaultEnvironmentId,
    runtimeId: `${snapshot.id}:${snapshot.version}`,
    state: applicationRuntimeState(application, snapshot),
    health: snapshot.state === 'active' ? 'healthy' : 'unknown',
    releaseId: snapshot.releaseId,
    url: openUrl,
    startedAt: snapshot.createdAt,
    lastSeenAt: snapshot.lastAccessedAt,
    lastCheckedAt: snapshot.updatedAt,
    activeRequests: snapshot.activeRequests,
    failure: snapshot.lastError
      ? { code: 'RUNTIME_ERROR', message: snapshot.lastError }
      : null,
  };
}

function applicationRuntimeState(
  application: ManagedApplication,
  snapshot: AppSnapshot | undefined,
): string {
  if (!snapshot) {
    return application.desiredRuntimeState === 'running' ? 'idle' : 'stopped';
  }
  switch (snapshot.state) {
    case 'active':
      return 'running';
    case 'creating':
      return 'starting';
    case 'draining':
    case 'destroying':
      return 'stopping';
    case 'destroyed':
      return 'stopped';
    default:
      return snapshot.state;
  }
}

async function listApplicationsByRuntimeState(options: {
  host: Pick<LocalHostAdapter, 'getRuntime'>;
  managementStore: HubManagementStore;
  options: ApplicationListQueryOptions;
  applicationIds: readonly string[] | undefined;
  runtimeState: ApplicationRuntimeState;
}): Promise<{
  items: ManagedApplication[];
  total: number;
  limit: number;
  offset: number;
}> {
  const { runtimeState, options: queryOptions } = options;
  const { runtimeState: _ignoredRuntimeState, ...listOptions } = queryOptions;
  const allApplications: ManagedApplication[] = [];
  const sourceLimit = 100;
  let sourceOffset = 0;

  while (true) {
    const page = await options.managementStore.listApplications({
      ...listOptions,
      applicationIds: options.applicationIds,
      limit: sourceLimit,
      offset: sourceOffset,
    });
    allApplications.push(...page.items);
    if (
      page.items.length === 0 ||
      sourceOffset + page.items.length >= page.total
    ) {
      break;
    }
    sourceOffset += page.items.length;
  }

  const matchingApplications = allApplications.filter(
    (application) =>
      applicationRuntimeState(
        application,
        options.host.getRuntime(toHubApplication(application)),
      ) === runtimeState,
  );
  const limit = queryOptions.limit ?? 20;
  const offset = queryOptions.offset ?? 0;
  return {
    items: matchingApplications.slice(offset, offset + limit),
    total: matchingApplications.length,
    limit,
    offset,
  };
}

function applicationLinks(
  application: ManagedApplication,
  publicBasePath: string,
  appPublicOrigin: string | undefined,
): { self: string; open: string | null } {
  return {
    self: `${normalizePath(publicBasePath)}/api/apps/${encodeURIComponent(application.id)}`,
    open:
      application.status === 'active' &&
      application.desiredRuntimeState === 'running' &&
      application.activeReleaseId
        ? applicationOpenUrl(application.slug, appPublicOrigin)
        : null,
  };
}

function applicationOpenUrl(
  slug: string,
  appPublicOrigin: string | undefined,
): string | null {
  if (!appPublicOrigin) return null;
  const origin = new URL(appPublicOrigin).origin;
  return new URL(`/${encodeURIComponent(slug)}/`, `${origin}/`).toString();
}

function normalizePath(value: string): string {
  const normalized = value.trim().replace(/^\/+|\/+$/g, '');
  return normalized ? `/${normalized}` : '';
}

function releaseSummary(
  release: Pick<PublicRelease, 'id' | 'version' | 'createdAt'>,
): Record<string, unknown> {
  return {
    id: release.id,
    version: release.version,
    createdAt: release.createdAt,
  };
}

function releaseProjection(release: HubRelease): Record<string, unknown> {
  return {
    id: release.id,
    applicationId: release.applicationId,
    version: release.version,
    checksum: release.checksum,
    manifest: release.manifest,
    sizeBytes: release.sizeBytes,
    verificationStatus: release.verificationStatus,
    createdBy: release.createdBy,
    createdAt: release.createdAt,
  };
}

function applicationProjection(
  application: HubApplication | ManagedApplication,
): Record<string, unknown> {
  return compactObject({
    id: application.id,
    slug: application.slug,
    name: application.name,
    description: application.description,
    status: application.status,
    isDefault: 'isDefault' in application ? application.isDefault : undefined,
    revision: 'revision' in application ? application.revision : undefined,
    defaultEnvironmentId: application.defaultEnvironmentId,
    createdBy: application.createdBy,
    createdAt: application.createdAt,
    updatedAt: application.updatedAt,
  });
}

function compactObject(
  value: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  );
}

async function getDefaultApplicationStatus(
  managementStore: HubManagementStore,
): Promise<{
  status: 'preparing' | 'ready' | 'failed';
  retryable: boolean;
  errorCode: string | null;
}> {
  const application = await managementStore.getDefaultApplication();
  if (application) {
    return { status: 'ready', retryable: false, errorCode: null };
  }
  return { status: 'preparing', retryable: false, errorCode: null };
}

interface ApplicationListQueryOptions extends ApplicationListOptions {
  readonly runtimeState?: ApplicationRuntimeState;
}

function readApplicationListOptions(
  context: HubContext,
): ApplicationListQueryOptions {
  const pagination = readPagination(context);
  const statuses = allowedRepeatedQuery(
    context.req.queries('status') ?? [],
    ['active', 'archived'] as const,
    'status',
  );
  const sort = context.req.query('sort');
  const allowedSort = [
    'name',
    '-name',
    'slug',
    '-slug',
    'createdAt',
    '-createdAt',
    'updatedAt',
    '-updatedAt',
  ] as const;
  return {
    ...pagination,
    query: context.req.query('query')?.trim() || undefined,
    statuses: statuses.length ? statuses : undefined,
    runtimeState: optionalAllowedQuery(
      context.req.query('runtimeState'),
      APPLICATION_RUNTIME_STATES,
      'runtimeState',
    ),
    sort: optionalAllowedQuery(sort, allowedSort, 'sort'),
  };
}

function requireHeaderIdempotencyKey(context: HubContext): string {
  const value = context.req.header('idempotency-key');
  if (
    !value ||
    value.length > 255 ||
    !/^[\x20-\x7e]+$/.test(value) ||
    !value.trim()
  ) {
    throw new HubDomainError(
      'INVALID_IDEMPOTENCY_KEY',
      'Idempotency-Key must contain 1 to 255 printable ASCII characters.',
      { status: 400 },
    );
  }
  return value;
}

function requireIfMatchRevision(context: HubContext): number {
  const value = context.req.header('if-match')?.trim();
  const match = value?.match(/^(?:W\/)?"rev-(\d+)"$/);
  if (!match) {
    throw new HubDomainError(
      'PRECONDITION_REQUIRED',
      'A current If-Match revision is required.',
      { status: 428 },
    );
  }
  return Number(match[1]);
}

function setRevisionEtag(
  response: Response,
  resource: { revision?: number },
): void {
  const revision = Number(resource.revision);
  if (Number.isInteger(revision) && revision > 0) {
    response.headers.set('etag', `"rev-${revision}"`);
  }
}

function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): void {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(value).find((key) => !allowedSet.has(key));
  if (unknown) {
    throw new HubDomainError('VALIDATION_ERROR', `${unknown} is not allowed.`, {
      status: 422,
      issues: [
        {
          path: unknown,
          code: 'unknown_field',
          message: `${unknown} is not allowed.`,
        },
      ],
    });
  }
}

function nullableString(value: unknown, field: string): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') {
    throw new HubDomainError(
      'VALIDATION_ERROR',
      `${field} must be a string or null.`,
      { status: 422 },
    );
  }
  return value;
}

function nullableOptionalString(
  value: unknown,
  field: string,
): string | null | undefined {
  if (value === undefined) return undefined;
  return nullableString(value, field);
}

function assertApplicationSlugNotReserved(slug: string): void {
  const normalized = slug.toLowerCase();
  const reserved = new Set([
    'api',
    'auth',
    'hub',
    '__apps',
    '__health',
    'default',
  ]);
  if (reserved.has(normalized)) {
    throw new HubDomainError(
      'APPLICATION_SLUG_RESERVED',
      `Application slug "${normalized}" is reserved.`,
      { status: 422 },
    );
  }
}

async function getActiveRelease(
  store: HubStore,
  application: ManagedApplication,
): Promise<import('./types.ts').HubRelease> {
  if (!application.activeReleaseId) {
    throw new HubDomainError(
      'ACTIVE_RELEASE_REQUIRED',
      'The application has no active release.',
      { status: 409 },
    );
  }
  const release = await store.getRelease(application.activeReleaseId);
  if (!release) {
    throw new HubDomainError(
      'ACTIVE_RELEASE_NOT_FOUND',
      'The active release was not found.',
      { status: 409 },
    );
  }
  return release;
}

function readMemberListOptions(context: HubContext): MemberListOptions {
  const pagination = readPagination(context);
  const status = context.req.query('status');
  const sort = context.req.query('sort');
  const allowedSort = [
    'name',
    '-name',
    'createdAt',
    '-createdAt',
    'lastActiveAt',
    '-lastActiveAt',
  ] as const satisfies readonly MemberSort[];
  const role = context.req.query('role');
  return {
    ...pagination,
    query: context.req.query('query')?.trim() || undefined,
    status: optionalAllowedQuery(
      status,
      ['active', 'disabled'] as const,
      'status',
    ),
    role: optionalAllowedQuery(
      role,
      HUB_ROLE_DEFINITIONS.map((definition) => definition.id),
      'role',
    ),
    applicationId: context.req.query('applicationId')?.trim() || undefined,
    sort: optionalAllowedQuery(sort, allowedSort, 'sort'),
  };
}

function readApplicationAccessListOptions(
  context: HubContext,
): ApplicationAccessListOptions {
  const status = context.req.query('status');
  const sort = context.req.query('sort');
  const allowedSort = [
    'name',
    '-name',
    'createdAt',
    '-createdAt',
  ] as const satisfies readonly NonNullable<
    ApplicationAccessListOptions['sort']
  >[];
  const role = context.req.query('role');
  return {
    ...readPagination(context),
    query: context.req.query('query')?.trim() || undefined,
    status: optionalAllowedQuery(
      status,
      ['active', 'disabled'] as const,
      'status',
    ),
    role: optionalAllowedQuery(
      role,
      HUB_ROLE_DEFINITIONS.filter((definition) =>
        definition.scopes.includes('application'),
      ).map((definition) => definition.id),
      'role',
    ),
    sort: optionalAllowedQuery(sort, allowedSort, 'sort'),
  };
}

function readInvitationListOptions(context: HubContext): InvitationListOptions {
  const pagination = readPagination(context);
  const status = context.req.query('status');
  const sort = context.req.query('sort');
  const allowedStatuses = [
    'pending',
    'accepted',
    'expired',
    'revoked',
  ] as const satisfies readonly InvitationStatus[];
  const allowedSort = [
    'createdAt',
    '-createdAt',
    'expiresAt',
    '-expiresAt',
  ] as const satisfies readonly NonNullable<InvitationListOptions['sort']>[];
  return {
    ...pagination,
    query: context.req.query('query')?.trim() || undefined,
    status: optionalAllowedQuery(status, allowedStatuses, 'status'),
    sort: optionalAllowedQuery(sort, allowedSort, 'sort'),
  };
}

function readAuditListOptions(
  context: HubContext,
  includePagination: boolean = true,
): AuditListOptions {
  const pagination = includePagination ? readPagination(context) : {};
  const result = context.req.query('result');
  const source = context.req.query('source');
  const action = context.req.queries('action') ?? [];
  const sort = context.req.query('sort');
  const actions = allowedRepeatedQuery(action, [...AUDIT_ACTIONS], 'action');
  return {
    ...pagination,
    applicationId: context.req.query('applicationId') || undefined,
    actorId: context.req.query('actorId') || undefined,
    action: actions.length ? actions : undefined,
    resource: context.req.query('resource') || undefined,
    resourceId: context.req.query('resourceId') || undefined,
    result: optionalAllowedQuery(
      result,
      ['success', 'failure', 'denied'] as const,
      'result',
    ),
    source: optionalAllowedQuery(
      source,
      ['web', 'agent', 'system'] as const,
      'source',
    ),
    query: context.req.query('query') || undefined,
    from: optionalQueryDate(context.req.query('from'), 'from'),
    to: optionalQueryDate(context.req.query('to'), 'to'),
    sort:
      optionalAllowedQuery(
        sort,
        ['createdAt', '-createdAt'] as const,
        'sort',
      ) ?? '-createdAt',
  };
}

function optionalQueryDate(
  value: string | undefined,
  field: string,
): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    throw invalidQuery(field, `${field} must be an ISO 8601 date-time.`);
  }
  return date;
}

function readReleaseListOptions(context: HubContext): ReleaseListOptions {
  const pagination = readPagination(context);
  const sort = context.req.query('sort');
  const allowedSort = [
    'version',
    '-version',
    'createdAt',
    '-createdAt',
  ] as const satisfies readonly NonNullable<ReleaseListOptions['sort']>[];
  return {
    ...pagination,
    query: context.req.query('query')?.trim() || undefined,
    sort: optionalAllowedQuery(sort, allowedSort, 'sort'),
  };
}

function readDeploymentListOptions(
  context: HubContext,
  includeApplicationId: boolean,
  includePagination: boolean = true,
): DeploymentListOptions {
  const statuses = allowedRepeatedQuery(
    context.req.queries('status') ?? [],
    DEPLOYMENT_STATUSES,
    'status',
  );
  const types = allowedRepeatedQuery(
    context.req.queries('type') ?? [],
    DEPLOYMENT_TYPES,
    'type',
  );
  const sort = context.req.query('sort');
  const allowedSort = [
    'createdAt',
    '-createdAt',
    'startedAt',
    '-startedAt',
    'finishedAt',
    '-finishedAt',
  ] as const satisfies readonly NonNullable<DeploymentListOptions['sort']>[];
  return {
    ...(includePagination ? readPagination(context) : {}),
    ...(includeApplicationId
      ? {
          applicationId:
            context.req.query('applicationId')?.trim() || undefined,
        }
      : {}),
    statuses: statuses.length ? statuses : undefined,
    types: types.length ? types : undefined,
    requestedBy: context.req.query('requestedBy')?.trim() || undefined,
    from: optionalQueryDate(context.req.query('from'), 'from'),
    to: optionalQueryDate(context.req.query('to'), 'to'),
    query: context.req.query('query')?.trim() || undefined,
    sort: optionalAllowedQuery(sort, allowedSort, 'sort'),
  };
}

function parseReleaseUploadCreateInput(
  body: Record<string, unknown>,
): ReleaseUploadCreateInput {
  rejectUnknownKeys(body, [
    'version',
    'checksum',
    'sizeBytes',
    'archiveChecksum',
    'archiveSizeBytes',
    'archiveFormat',
    'manifest',
  ]);
  const archiveFormat = requiredString(body.archiveFormat, 'archiveFormat');
  if (archiveFormat !== 'tar.gz') {
    throw new HubDomainError(
      'UNSUPPORTED_ARCHIVE_FORMAT',
      'Only tar.gz archives are supported.',
      { status: 415 },
    );
  }
  return {
    version: requiredString(body.version, 'version'),
    checksum: requiredString(body.checksum, 'checksum'),
    sizeBytes: requiredNonNegativeInteger(body.sizeBytes, 'sizeBytes'),
    archiveChecksum: requiredString(body.archiveChecksum, 'archiveChecksum'),
    archiveSizeBytes: requiredNonNegativeInteger(
      body.archiveSizeBytes,
      'archiveSizeBytes',
    ),
    archiveFormat,
    manifest: objectValue(body.manifest, 'manifest'),
  };
}

function requiredNonNegativeInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new HubDomainError(
      'VALIDATION_ERROR',
      `${field} must be a non-negative safe integer.`,
      { status: 422 },
    );
  }
  return value;
}

function parseContentLength(value: string | undefined): number {
  if (!value || !/^\d+$/.test(value)) {
    throw new HubDomainError(
      'CONTENT_LENGTH_REQUIRED',
      'A valid Content-Length header is required.',
      { status: 411 },
    );
  }
  const length = Number(value);
  if (!Number.isSafeInteger(length)) {
    throw new HubDomainError(
      'CONTENT_LENGTH_INVALID',
      'Content-Length is too large.',
      { status: 413 },
    );
  }
  return length;
}

function toReleaseUploadActor(
  actor: AuthenticatedHubActor,
): ReleaseUploadActor {
  return {
    userId: actor.user.id,
    credentialId: actor.agent?.credentialId ?? null,
    isAdmin:
      !actor.agent &&
      (actor.roles.includes('owner') || actor.roles.includes('admin')),
  };
}

function projectReleaseUpload(
  upload: import('./release-upload-service.ts').PublicReleaseUpload,
  authoritativeOrigin: string,
  publicBasePath: string,
): Record<string, unknown> {
  return {
    ...upload,
    upload: {
      method: 'PUT',
      url: new URL(
        `${normalizePath(publicBasePath)}/api/release-uploads/${encodeURIComponent(upload.id)}/content`,
        `${new URL(authoritativeOrigin).origin}/`,
      ).toString(),
      auth: { mode: 'hub-bearer' },
      headers: { 'Content-Type': 'application/gzip' },
    },
  };
}

function parseMemberAccess(body: Record<string, unknown>): MemberAccessInput {
  rejectUnknownKeys(body, ['globalRoles', 'applications']);
  if (!Array.isArray(body.globalRoles) || !Array.isArray(body.applications)) {
    throw new HubDomainError(
      'VALIDATION_ERROR',
      'globalRoles and applications are required arrays.',
      { status: 422 },
    );
  }
  const applications = body.applications.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new HubDomainError(
        'VALIDATION_ERROR',
        'Invalid application access.',
        { status: 422 },
      );
    }
    const item = entry as Record<string, unknown>;
    if (!Array.isArray(item.roles) || typeof item.applicationId !== 'string') {
      throw new HubDomainError(
        'VALIDATION_ERROR',
        'Invalid application access.',
        { status: 422 },
      );
    }
    return {
      applicationId: item.applicationId,
      roles: item.roles.filter(
        (role): role is string => typeof role === 'string',
      ),
    };
  });
  return {
    globalRoles: body.globalRoles.filter(
      (role): role is string => typeof role === 'string',
    ),
    applications,
  };
}

function assertOwnerRoleAssignmentAllowed(
  actor: AuthenticatedHubActor,
  nextGlobalRoles: readonly string[],
  previousGlobalRoles: readonly string[] = [],
): void {
  if (
    !actor.roles.includes('owner') &&
    (nextGlobalRoles.includes('owner') || previousGlobalRoles.includes('owner'))
  ) {
    throw new HubDomainError(
      'OWNER_ASSIGNMENT_FORBIDDEN',
      'Only an Owner can assign or transfer the Owner role.',
      { status: 403 },
    );
  }
}

function memberAccessAuditProjection(
  access: Readonly<{
    globalRoles: readonly string[];
    applications: readonly Readonly<{
      applicationId: string;
      roles: readonly string[];
    }>[];
  }>,
): Record<string, unknown> {
  return {
    globalRoles: [...access.globalRoles].sort(),
    applications: access.applications
      .map((application) => ({
        applicationId: application.applicationId,
        roles: [...application.roles].sort(),
      }))
      .sort((left, right) =>
        left.applicationId.localeCompare(right.applicationId),
      ),
  };
}

function parseCreateInvitationInput(
  body: Record<string, unknown>,
): CreateInvitationInput {
  const access = objectValue(body.access, 'access');
  rejectUnknownKeys(access, ['globalRoles', 'applications']);
  if (
    !Array.isArray(access.globalRoles) ||
    !Array.isArray(access.applications)
  ) {
    throw new HubDomainError(
      'VALIDATION_ERROR',
      'access.globalRoles and access.applications must be arrays.',
      { status: 422 },
    );
  }
  const applications = access.applications.map((entry, index) => {
    const application = objectValue(entry, `access.applications.${index}`);
    rejectUnknownKeys(application, ['applicationId', 'roles']);
    if (!Array.isArray(application.roles)) {
      throw new HubDomainError(
        'VALIDATION_ERROR',
        `access.applications.${index}.roles must be an array.`,
        { status: 422 },
      );
    }
    return {
      applicationId: requiredString(
        application.applicationId,
        `access.applications.${index}.applicationId`,
      ),
      roles: application.roles.map((role) =>
        requiredString(role, `access.applications.${index}.roles`),
      ),
    };
  });
  const invitationAccess: InvitationAccessInput = {
    globalRoles: access.globalRoles.map((role) =>
      requiredString(role, 'access.globalRoles'),
    ),
    applications,
  };
  if (
    typeof body.expiresInDays !== 'number' ||
    !Number.isSafeInteger(body.expiresInDays)
  ) {
    throw new HubDomainError(
      'VALIDATION_ERROR',
      'expiresInDays must be an integer.',
      { status: 422 },
    );
  }
  return {
    email: requiredString(body.email, 'email'),
    expiresInDays: body.expiresInDays,
    access: invitationAccess,
  };
}

function parseSettingsPatch(body: Record<string, unknown>): HubSettingsPatch {
  rejectUnknownKeys(body, ['releaseRetention', 'audit', 'confirmation']);
  return {
    ...(body.releaseRetention === undefined
      ? {}
      : {
          releaseRetention: parseSettingsObject<
            NonNullable<HubSettingsPatch['releaseRetention']>
          >(body.releaseRetention, [
            'automaticCleanupEnabled',
            'keepPerApplication',
            'minimumAgeDays',
          ]),
        }),
    ...(body.audit === undefined
      ? {}
      : {
          audit: parseSettingsObject<NonNullable<HubSettingsPatch['audit']>>(
            body.audit,
            ['recordDeniedMutations', 'retentionDays'],
          ),
        }),
    ...(body.confirmation === undefined
      ? {}
      : {
          confirmation: parseSettingsObject<
            NonNullable<HubSettingsPatch['confirmation']>
          >(body.confirmation, [
            'rollback',
            'archiveApplication',
            'rotateRuntimeSecret',
          ]),
        }),
  };
}

function parseAgentScopes(value: unknown): AgentScope[] {
  if (!Array.isArray(value)) {
    throw new HubDomainError('VALIDATION_ERROR', 'scopes must be an array.', {
      status: 422,
    });
  }
  return value.map((scope) => {
    if (
      typeof scope !== 'string' ||
      !AGENT_SCOPES.includes(scope as AgentScope)
    ) {
      throw new HubDomainError(
        'VALIDATION_ERROR',
        'An unknown Agent scope was requested.',
        { status: 422 },
      );
    }
    return scope as AgentScope;
  });
}

function parseAgentApplicationScope(value: unknown): AgentApplicationScope {
  const object = objectValue(value, 'applicationScope');
  if (object.mode === 'all-authorized') return { mode: 'all-authorized' };
  if (object.mode !== 'selected' || !Array.isArray(object.applicationIds)) {
    throw new HubDomainError(
      'VALIDATION_ERROR',
      'applicationScope is invalid.',
      { status: 422 },
    );
  }
  return {
    mode: 'selected',
    applicationIds: object.applicationIds.map((id) =>
      requiredString(id, 'applicationId'),
    ),
  };
}

async function allowedAgentScopes(
  authorization: HubAuthorization,
  userId: string,
  applicationScope: AgentApplicationScope,
  authorizedApplicationIds: readonly string[],
): Promise<AgentScope[]> {
  const allowed: AgentScope[] = ['profile'];
  const selectedApplicationIds =
    applicationScope.mode === 'selected'
      ? applicationScope.applicationIds
      : authorizedApplicationIds;
  for (const [scope, resource, action] of AGENT_SCOPE_CAPABILITIES) {
    const global = await authorization.can(userId, { resource, action });
    if (global) {
      allowed.push(scope);
      continue;
    }
    if (scope === 'apps:create' || selectedApplicationIds.length === 0)
      continue;
    const applicationChecks = await Promise.all(
      selectedApplicationIds.map((applicationId) =>
        authorization.can(userId, { resource, action, applicationId }),
      ),
    );
    const applicationAccessAllowed =
      applicationScope.mode === 'selected'
        ? applicationChecks.every(Boolean)
        : applicationChecks.some(Boolean);
    if (applicationAccessAllowed) allowed.push(scope);
  }
  return allowed;
}

async function listAuthorizedApplicationIds(
  managementStore: HubManagementStore,
  authorization: HubAuthorization,
  userId: string,
): Promise<string[]> {
  const applications = [];
  let offset = 0;
  while (true) {
    const page = await managementStore.listApplications({ limit: 100, offset });
    applications.push(...page.items);
    offset += page.items.length;
    if (offset >= page.total || page.items.length === 0) break;
  }
  const allowed = await Promise.all(
    applications.map(async (application) =>
      (await authorization.can(userId, {
        resource: 'hub.app',
        action: 'read',
        applicationId: application.id,
      }))
        ? application.id
        : undefined,
    ),
  );
  return allowed.filter((id): id is string => Boolean(id));
}

function assertBrowserActor(actor: AuthenticatedHubActor): void {
  if (actor.agent) {
    throw new HubDomainError(
      'INSUFFICIENT_SCOPE',
      'Agent credentials cannot manage credential records.',
      { status: 403 },
    );
  }
}

function setCredentialResponseHeaders(response: Response): void {
  response.headers.set('cache-control', 'no-store');
  response.headers.set('pragma', 'no-cache');
}

function parseSettingsObject<T extends object>(
  value: unknown,
  allowed: readonly string[],
): T {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HubDomainError(
      'VALIDATION_ERROR',
      'Settings sections must be objects.',
      { status: 422 },
    );
  }
  const object = value as Record<string, unknown>;
  rejectUnknownKeys(object, allowed);
  return object as T;
}

function auditCsv(
  logs: readonly import('./management-store.ts').PublicAuditLog[],
): string {
  const header = [
    'id',
    'createdAt',
    'actor',
    'application',
    'action',
    'resource',
    'resourceId',
    'result',
    'source',
  ];
  const rows = logs.map((log) => [
    log.id,
    log.createdAt,
    log.actor?.name ?? log.actorId ?? '',
    log.application?.slug ?? log.applicationId ?? '',
    log.action,
    log.resource,
    log.resourceId ?? '',
    log.result,
    log.source,
  ]);
  return (
    [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') +
    '\r\n'
  );
}

interface DeploymentCsvReferences {
  readonly applications: ReadonlyMap<
    string,
    { readonly name: string; readonly slug: string }
  >;
  readonly releases: ReadonlyMap<string, string>;
  readonly members: ReadonlyMap<string, string>;
}

async function loadDeploymentCsvReferences(
  database: HubDatabaseRuntime,
  deployments: readonly HubDeployment[],
): Promise<DeploymentCsvReferences> {
  const applicationIds = uniqueStrings(
    deployments.map((deployment) => deployment.applicationId),
  );
  const releaseIds = uniqueStrings(
    deployments.flatMap((deployment) => [
      deployment.targetReleaseId,
      deployment.previousReleaseId,
    ]),
  );
  const memberIds = uniqueStrings(
    deployments.map((deployment) => deployment.requestedBy),
  );
  const applications = new Map<
    string,
    { readonly name: string; readonly slug: string }
  >();
  for (const ids of chunks(applicationIds, 500)) {
    const rows = await database.connection.query
      .selectFrom('hubApplications')
      .select(['id', 'name', 'slug'])
      .where('id', 'in', ids)
      .execute<{ id: string; name: string; slug: string }>();
    for (const row of rows)
      applications.set(row.id, { name: row.name, slug: row.slug });
  }
  const releases = new Map<string, string>();
  for (const ids of chunks(releaseIds, 500)) {
    const rows = await database.connection.query
      .selectFrom('hubReleases')
      .select(['id', 'version'])
      .where('id', 'in', ids)
      .execute<{ id: string; version: string }>();
    for (const row of rows) releases.set(row.id, row.version);
  }
  const members = new Map<string, string>();
  for (const ids of chunks(memberIds, 500)) {
    const rows = await database.connection.query
      .selectFrom('user')
      .select(['id', 'name'])
      .where('id', 'in', ids)
      .execute<{ id: string; name: string }>();
    for (const row of rows) members.set(row.id, row.name);
  }
  return { applications, releases, members };
}

function deploymentCsv(
  deployments: readonly HubDeployment[],
  references: DeploymentCsvReferences,
): string {
  const header = [
    'id',
    'application',
    'applicationSlug',
    'applicationId',
    'environmentId',
    'type',
    'status',
    'previousRelease',
    'previousReleaseId',
    'targetRelease',
    'targetReleaseId',
    'requestedBy',
    'requestedById',
    'startedAt',
    'finishedAt',
    'failureCode',
    'failureMessage',
    'createdAt',
  ];
  const rows = deployments.map((deployment) => {
    const application = references.applications.get(deployment.applicationId);
    return [
      deployment.id,
      application?.name ?? deployment.applicationId,
      application?.slug ?? '',
      deployment.applicationId,
      deployment.environmentId,
      deployment.type,
      deployment.status,
      deployment.previousReleaseId
        ? (references.releases.get(deployment.previousReleaseId) ?? '')
        : '',
      deployment.previousReleaseId ?? '',
      references.releases.get(deployment.targetReleaseId) ?? '',
      deployment.targetReleaseId,
      references.members.get(deployment.requestedBy) ?? deployment.requestedBy,
      deployment.requestedBy,
      deployment.startedAt ?? '',
      deployment.finishedAt ?? '',
      deployment.failureCode ?? '',
      deployment.failureMessage ?? '',
      deployment.createdAt,
    ];
  });
  return (
    [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') +
    '\r\n'
  );
}

function uniqueStrings(values: readonly (string | null)[]): string[] {
  return [
    ...new Set(values.filter((value): value is string => Boolean(value))),
  ];
}

function chunks<T>(values: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let offset = 0; offset < values.length; offset += size) {
    result.push(values.slice(offset, offset + size));
  }
  return result;
}

function csvCell(value: string): string {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

async function requireActor(
  context: Parameters<typeof successResponse>[0],
  auth: Auth,
  authorization: HubAuthorization,
  managementStore: HubManagementStore,
  agentAuth: AgentAuthService | undefined,
  agentRequirement: AgentAccessRequirement | null,
): Promise<AuthenticatedHubActor> {
  const bearer = readBearerToken(context.req.header('authorization'));
  if (bearer) {
    if (!agentAuth || !agentRequirement) {
      throw new HubDomainError(
        'INSUFFICIENT_SCOPE',
        'Agent credentials cannot access this endpoint.',
        { status: 403 },
      );
    }
    const principal = await agentAuth.authenticateAccessToken(
      bearer,
      agentRequirement,
    );
    const member = await managementStore.getMember(principal.userId);
    if (!member || member.status !== 'active') {
      throw new HubDomainError('TOKEN_INVALID', 'Agent token is invalid.', {
        status: 401,
      });
    }
    const actor = await authorization.actor({
      id: member.id,
      name: member.name,
      email: member.email,
      username: member.username,
    });
    const authenticated = { ...actor, agent: principal };
    context.set('actor', authenticated);
    return authenticated;
  }
  const session = await auth.getSession(context.req.raw.headers);
  if (!session) {
    throw new HubDomainError('UNAUTHORIZED', 'Authentication required.', {
      status: 401,
    });
  }
  const sessionMember = await managementStore.getMember(session.user.id);
  if (sessionMember?.status === 'disabled') {
    throw new HubDomainError('UNAUTHORIZED', 'Authentication required.', {
      status: 401,
    });
  }
  const actor = await authorization.actor(toUserSummary(session));
  context.set('actor', actor);
  return actor;
}

function readBearerToken(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const match = /^Bearer\s+(\S+)$/i.exec(value.trim());
  return match?.[1];
}

function visibleApplicationIds(
  actor: AuthenticatedHubActor,
  resource: HubResource,
  action: HubAction,
): readonly string[] | undefined {
  const globalAccess = actor.capabilities.global.some((capability) =>
    projectedCapabilityAllows(capability, resource, action),
  );
  const roleApplicationIds = globalAccess
    ? undefined
    : actor.capabilities.application
        .filter((application) =>
          application.capabilities.some((capability) =>
            projectedCapabilityAllows(capability, resource, action),
          ),
        )
        .map((application) => application.applicationId);
  if (actor.agent?.applicationScope.mode !== 'selected') {
    return roleApplicationIds;
  }
  const selected = new Set(actor.agent.applicationScope.applicationIds);
  return roleApplicationIds === undefined
    ? [...selected]
    : roleApplicationIds.filter((applicationId) => selected.has(applicationId));
}

function visibleRuntimeApplicationIds(
  actor: AuthenticatedHubActor,
): readonly string[] | undefined {
  if (actor.agent && !actor.agent.scopes.includes('runtime:read')) return [];
  return visibleApplicationIds(actor, 'hub.runtime', 'read');
}

function intersectApplicationIds(
  left: readonly string[] | undefined,
  right: readonly string[] | undefined,
): readonly string[] | undefined {
  if (left === undefined) return right;
  if (right === undefined) return left;
  const allowed = new Set(right);
  return left.filter((applicationId) => allowed.has(applicationId));
}

function agentScopeAllows(
  actor: AuthenticatedHubActor,
  scope: AgentScope,
  applicationId: string,
): boolean {
  if (!actor.agent) return true;
  return (
    actor.agent.scopes.includes(scope) &&
    (actor.agent.applicationScope.mode === 'all-authorized' ||
      actor.agent.applicationScope.applicationIds.includes(applicationId))
  );
}

async function projectAgentCapabilities(
  actor: AuthenticatedHubActor,
  managementStore: HubManagementStore,
): Promise<HubCapabilities> {
  if (!actor.agent) return actor.capabilities;
  const mappings = AGENT_SCOPE_CAPABILITIES.filter(([scope]) =>
    actor.agent!.scopes.includes(scope),
  );
  if (actor.agent.applicationScope.mode === 'all-authorized') {
    const global = mergeProjectedCapabilities(
      mappings
        .filter(([, resource, action]) =>
          actor.capabilities.global.some((capability) =>
            projectedCapabilityAllows(capability, resource, action),
          ),
        )
        .map(([, resource, action]) => ({ resource, action })),
    );
    const application = actor.capabilities.application
      .map((entry) => ({
        applicationId: entry.applicationId,
        capabilities: mergeProjectedCapabilities(
          mappings
            .filter(([, resource, action]) =>
              entry.capabilities.some((capability) =>
                projectedCapabilityAllows(capability, resource, action),
              ),
            )
            .map(([, resource, action]) => ({ resource, action })),
        ),
      }))
      .filter((entry) => entry.capabilities.length > 0);
    return { global, application };
  }

  const application = (
    await Promise.all(
      actor.agent.applicationScope.applicationIds.map(async (applicationId) => {
        if (!(await managementStore.getApplication(applicationId)))
          return undefined;
        const current = actor.capabilities.application.find(
          (entry) => entry.applicationId === applicationId,
        );
        const capabilities = mergeProjectedCapabilities(
          mappings
            .filter(([scope, resource, action]) => {
              if (scope === 'apps:create') return false;
              return (
                actor.capabilities.global.some((capability) =>
                  projectedCapabilityAllows(capability, resource, action),
                ) ||
                current?.capabilities.some((capability) =>
                  projectedCapabilityAllows(capability, resource, action),
                )
              );
            })
            .map(([, resource, action]) => ({ resource, action })),
        );
        return capabilities.length > 0
          ? { applicationId, capabilities }
          : undefined;
      }),
    )
  ).filter(
    (entry): entry is HubCapabilities['application'][number] =>
      entry !== undefined,
  );
  return { global: [], application };
}

function mergeProjectedCapabilities(
  values: readonly { readonly resource: string; readonly action: string }[],
): { resource: string; actions: string[] }[] {
  const grouped = new Map<string, Set<string>>();
  for (const value of values) {
    const actions = grouped.get(value.resource) ?? new Set<string>();
    actions.add(value.action);
    grouped.set(value.resource, actions);
  }
  return [...grouped].map(([resource, actions]) => ({
    resource,
    actions: [...actions],
  }));
}

function projectedCapabilityAllows(
  capability: { resource: string; actions: readonly string[] },
  resource: HubResource,
  action: HubAction,
): boolean {
  return (
    (capability.resource === '*' || capability.resource === resource) &&
    (capability.actions.includes('*') || capability.actions.includes(action))
  );
}

function constrainApplicationIds(
  visibleIds: readonly string[] | undefined,
  requestedId: string | undefined,
): readonly string[] | undefined {
  if (!requestedId) return visibleIds;
  if (visibleIds === undefined) return [requestedId];
  return visibleIds.includes(requestedId) ? [requestedId] : [];
}

function agentRequirementForRequest(
  context: HubContext,
): AgentAccessRequirement | null {
  const method = context.req.method;
  const path = context.req.path.replace(/^.*\/api/, '') || '/';
  if (method === 'GET' && path === '/me') return { scope: 'profile' };
  if (path === '/apps' && method === 'GET') return { scope: 'apps:read' };
  if (path === '/apps' && method === 'POST') return { scope: 'apps:create' };

  const applicationMatch = /^\/apps\/([^/]+)(?:\/(.*))?$/.exec(path);
  if (applicationMatch) {
    const applicationId = decodeURIComponent(applicationMatch[1]);
    const suffix = applicationMatch[2] ?? '';
    if (!suffix && method === 'GET') {
      return { scope: 'apps:read', applicationId };
    }
    if (suffix === 'release-uploads' && method === 'POST') {
      return { scope: 'releases:publish', applicationId };
    }
    if (
      (suffix === 'releases' || /^releases\/[^/]+$/.test(suffix)) &&
      method === 'GET'
    ) {
      return { scope: 'releases:read', applicationId };
    }
    if (suffix === 'deployments' && method === 'GET') {
      return { scope: 'deployments:read', applicationId };
    }
    if (suffix === 'deployments' && method === 'POST') {
      return { applicationId };
    }
    if (suffix === 'runtime' && method === 'GET') {
      return { scope: 'runtime:read', applicationId };
    }
    if (/^runtime\/(?:start|stop|restart)$/.test(suffix) && method === 'POST') {
      return { scope: 'runtime:control', applicationId };
    }
  }
  if (/^\/release-uploads\/[^/]+(?:\/content|\/complete)?$/.test(path)) {
    return { scope: 'releases:publish' };
  }
  if (
    (path === '/deployments' || path === '/deployments.csv') &&
    method === 'GET'
  ) {
    return { scope: 'deployments:read' };
  }
  if (/^\/deployments\/[^/]+(?:\/events)?$/.test(path) && method === 'GET') {
    return { scope: 'deployments:read' };
  }
  return null;
}

async function requireAuthorizedApplication(
  store: HubStore,
  authorization: HubAuthorization,
  userId: string,
  applicationId: string,
  action: HubAction,
  resource: HubResource = 'hub.app',
): Promise<HubApplication> {
  if (
    !(await authorization.can(userId, {
      resource,
      action,
      applicationId,
    }))
  ) {
    throw concealedNotFound('APPLICATION_NOT_FOUND', applicationId);
  }
  return store.requireApplication(applicationId);
}

async function requireAuthorizedDeployment(
  store: HubStore,
  authorization: HubAuthorization,
  actor: AuthenticatedHubActor,
  deploymentId: string,
): Promise<HubDeployment> {
  const deployment = await store.getDeployment(deploymentId);
  if (
    !deployment ||
    (actor.agent &&
      !agentApplicationScopeAllows(
        actor.agent,
        deployment?.applicationId ?? '',
      )) ||
    !(await authorization.can(actor.user.id, {
      resource: 'hub.deployment',
      action: 'read',
      applicationId: deployment.applicationId,
    }))
  ) {
    throw concealedNotFound('DEPLOYMENT_NOT_FOUND', deploymentId);
  }
  return deployment;
}

function concealedNotFound(code: string, id: string): HubDomainError {
  const resource =
    code === 'DEPLOYMENT_NOT_FOUND' ? 'Deployment' : 'Application';
  return new HubDomainError(code, `${resource} "${id}" was not found.`, {
    status: 404,
  });
}

function toUserSummary(session: AuthSession): HubUserSummary {
  if (!session) {
    throw new HubDomainError('UNAUTHORIZED', 'Authentication required.', {
      status: 401,
    });
  }
  const user = session.user;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    username:
      'username' in user && typeof user.username === 'string'
        ? user.username
        : null,
  };
}

function readPagination(
  context: Parameters<typeof successResponse>[0],
): HubListOptions {
  const limitValue = context.req.query('limit');
  const offsetValue = context.req.query('offset');
  const limit = limitValue === undefined ? 20 : Number(limitValue);
  const offset = offsetValue === undefined ? 0 : Number(offsetValue);
  if (
    (limitValue !== undefined && !/^\d+$/.test(limitValue)) ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 100
  ) {
    throw invalidQuery('limit', 'limit must be an integer from 1 to 100.');
  }
  if (
    (offsetValue !== undefined && !/^\d+$/.test(offsetValue)) ||
    !Number.isSafeInteger(offset) ||
    offset < 0
  ) {
    throw invalidQuery('offset', 'offset must be a non-negative integer.');
  }
  return {
    limit,
    offset,
  };
}

function optionalAllowedQuery<const T extends readonly string[]>(
  value: string | undefined,
  allowed: T,
  field: string,
): T[number] | undefined {
  if (value === undefined) return undefined;
  if (!new Set<string>(allowed).has(value)) {
    throw invalidQuery(field, `${field} contains an unsupported value.`);
  }
  return value as T[number];
}

function allowedRepeatedQuery<const T extends readonly string[]>(
  values: readonly string[],
  allowed: T,
  field: string,
): T[number][] {
  return values.map((value) => {
    const normalized = optionalAllowedQuery(value, allowed, field);
    if (normalized === undefined) {
      throw invalidQuery(field, `${field} contains an unsupported value.`);
    }
    return normalized;
  });
}

function invalidQuery(field: string, message: string): HubDomainError {
  return new HubDomainError('INVALID_QUERY', message, {
    status: 400,
    issues: [{ path: field, code: 'invalid_query', message }],
  });
}

function pageMeta(result: {
  total: number;
  limit: number;
  offset: number;
}): Record<string, number> {
  return { total: result.total, limit: result.limit, offset: result.offset };
}

async function jsonBody(
  context: Parameters<typeof successResponse>[0],
): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await context.req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new Error('object required');
    }
    return body as Record<string, unknown>;
  } catch {
    throw new HubDomainError(
      'INVALID_JSON',
      'Request body must be a JSON object.',
      { status: 400 },
    );
  }
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    const message = `${field} is required.`;
    throw new HubDomainError('VALIDATION_ERROR', message, {
      status: 422,
      issues: [{ path: field, code: 'required', message }],
    });
  }
  return value.trim();
}

function requiredUntrimmedString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    const message = `${field} is required.`;
    throw new HubDomainError('VALIDATION_ERROR', message, {
      status: 422,
      issues: [{ path: field, code: 'required', message }],
    });
  }
  return value;
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function objectValue(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HubDomainError(
      'VALIDATION_ERROR',
      `${field} must be an object.`,
      {
        status: 422,
        issues: [
          {
            path: field,
            code: 'invalid_type',
            message: `${field} must be an object.`,
          },
        ],
      },
    );
  }
  return value as Record<string, unknown>;
}

function deploymentType(
  value: unknown,
): NonNullable<CreateDeploymentInput['type']> {
  if (value === undefined || value === null || value === '') return 'deploy';
  if (value === 'deploy' || value === 'rollback' || value === 'redeploy')
    return value;
  throw new HubDomainError(
    'VALIDATION_ERROR',
    'type must be deploy, rollback, or redeploy.',
    {
      status: 422,
      issues: [
        {
          path: 'type',
          code: 'invalid_value',
          message: 'type must be deploy, rollback, or redeploy.',
        },
      ],
    },
  );
}

function deploymentAgentScope(
  type: NonNullable<CreateDeploymentInput['type']>,
): AgentScope {
  return `deployments:${type}`;
}

function internalDeploymentIdempotencyKey(
  actor: AuthenticatedHubActor,
  idempotencyKey: string,
): string {
  const identity = actor.agent
    ? `credential:${actor.agent.credentialId}`
    : `actor:${actor.user.id}`;
  return createHash('sha256')
    .update(`${identity}\0${idempotencyKey}`)
    .digest('hex');
}

function projectDeployment(deployment: HubDeployment): Record<string, unknown> {
  return {
    id: deployment.id,
    applicationId: deployment.applicationId,
    environmentId: deployment.environmentId,
    targetReleaseId: deployment.targetReleaseId,
    previousReleaseId: deployment.previousReleaseId,
    type: deployment.type,
    status: deployment.status,
    requestedBy: deployment.requestedBy,
    startedAt: deployment.startedAt,
    finishedAt: deployment.finishedAt,
    failure:
      deployment.failureCode || deployment.failureMessage
        ? {
            code: deployment.failureCode ?? 'DEPLOYMENT_FAILED',
            message: deployment.failureMessage ?? 'Deployment failed.',
          }
        : null,
    createdAt: deployment.createdAt,
  };
}

function isTerminalDeployment(deployment: HubDeployment): boolean {
  return (
    deployment.status === 'succeeded' ||
    deployment.status === 'failed' ||
    deployment.status === 'cancelled'
  );
}

function successResponse(
  context: HubContext,
  data: unknown,
  meta: Record<string, unknown> = {},
  status: ContentfulStatusCode = 200,
): Response {
  const requestId = context.get('requestId') ?? crypto.randomUUID();
  return context.json({ data, meta, requestId }, status);
}

function assertSecureMutation(
  request: Request,
  authoritativeOrigin?: string,
): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;

  const contentType = request.headers
    .get('content-type')
    ?.split(';', 1)[0]
    ?.trim()
    .toLowerCase();
  const pathname = new URL(request.url).pathname;
  const isReleaseContent =
    request.method === 'PUT' &&
    /\/api\/release-uploads\/[^/]+\/content\/?$/.test(pathname);
  const mediaTypeAllowed = isReleaseContent
    ? contentType === 'application/gzip' || contentType === 'application/x-gzip'
    : request.method === 'DELETE' && request.body === null
      ? contentType === undefined
      : contentType === JSON_CONTENT_TYPE;
  if (!mediaTypeAllowed) {
    throw new HubDomainError(
      'UNSUPPORTED_MEDIA_TYPE',
      isReleaseContent
        ? 'Release content uploads must use application/gzip.'
        : 'Hub mutation requests must use application/json.',
      { status: 415 },
    );
  }

  const authorization = request.headers.get('authorization');
  const isBearerMutation = Boolean(readBearerToken(authorization ?? undefined));
  const isPublicAgentMutation =
    /\/api\/agent-auth\/(?:device|token|revoke)\/?$/.test(pathname);
  if (isBearerMutation || isPublicAgentMutation) return;

  const origin = parseOrigin(request.headers.get('origin') ?? undefined);
  const trustedOrigins = resolveMutationOrigins(request, authoritativeOrigin);
  if (!origin || !trustedOrigins.has(origin)) {
    throw new HubDomainError(
      'UNTRUSTED_ORIGIN',
      'Hub mutation requests must come from the Hub origin.',
      { status: 403 },
    );
  }
}

function resolveMutationOrigins(
  request: Request,
  authoritativeOrigin?: string,
): Set<string> {
  const configuredOrigin = parseOrigin(authoritativeOrigin);
  if (configuredOrigin) return resolveOriginAliases(configuredOrigin);

  const requestUrl = new URL(request.url);
  return resolveOriginAliases(requestUrl.origin);
}

function resolveOriginAliases(origin: string): Set<string> {
  const effectiveUrl = new URL(origin);
  const origins = new Set([effectiveUrl.origin]);
  if (!isLoopbackHostname(effectiveUrl.hostname)) return origins;

  const port = effectiveUrl.port ? `:${effectiveUrl.port}` : '';
  for (const hostname of ['localhost', '127.0.0.1', '[::1]']) {
    origins.add(`${effectiveUrl.protocol}//${hostname}${port}`);
  }
  return origins;
}

function parseOrigin(value: string | undefined): string | undefined {
  if (!value || value === 'null') return undefined;
  try {
    const url = new URL(value);
    if (url.origin === 'null') return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}

function isLoopbackHostname(hostname: string): boolean {
  return /^(?:localhost|127\.0\.0\.1|\[?::1\]?)$/i.test(hostname);
}

function errorResponse(
  context: HubContext,
  error: unknown,
  requestId: string,
): Response {
  const domainError = toDomainError(error);
  if (domainError.status >= 500) {
    logServerError(error, { operation: 'request', requestId });
  }
  return context.json(
    {
      error: {
        code: domainError.code,
        message: domainError.message,
        retryable: domainError.retryable,
        ...(domainError.issues ? { issues: domainError.issues } : {}),
      },
      requestId,
    },
    isContentfulStatus(domainError.status) ? domainError.status : 500,
  );
}

function toDomainError(error: unknown): HubDomainError {
  if (error instanceof HubDomainError) return error;
  if (error instanceof AppRegistryError) {
    const status = error.status;
    return new HubDomainError(
      error.code,
      status >= 500 ? PUBLIC_INTERNAL_ERROR_MESSAGE : error.message,
      {
        status: error.status,
        retryable: status >= 500,
        cause: error,
      },
    );
  }
  return new HubDomainError('INTERNAL_ERROR', PUBLIC_INTERNAL_ERROR_MESSAGE, {
    status: 500,
    retryable: true,
    cause: error,
  });
}

function logServerError(
  error: unknown,
  context: Record<string, unknown>,
): void {
  console.error('Hub server error', { ...context, error });
}

async function readResponseJson(
  response: Response,
): Promise<Record<string, unknown>> {
  try {
    const value: unknown = await response.json();
    return value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function isContentfulStatus(status: number): status is ContentfulStatusCode {
  return (
    status >= 200 &&
    status !== 204 &&
    status !== 205 &&
    status !== 304 &&
    status <= 599
  );
}

function stringProperty(
  value: Record<string, unknown>,
  key: string,
): string | undefined {
  const property = value[key];
  return typeof property === 'string' ? property : undefined;
}
