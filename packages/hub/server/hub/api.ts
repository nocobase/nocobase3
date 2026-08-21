import type { Auth, AuthSession } from "@nocobase/authentication";
import { AppRegistryError } from "@nocobase/app-host";
import type {
  AppDeploymentResult,
  AppRuntimeRegistry,
} from "@nocobase/app-host";
import { Hono, type Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { HubDatabaseRuntime } from "./database.ts";
import {
  HubAuthorization,
  type AuthorizedHubActor,
  type HubAction,
  type HubResource,
} from "./authorization.ts";
import {
  HubDomainError,
  HubStore,
  type CreateApplicationInput,
  type CreateDeploymentInput,
  type CreateReleaseInput,
  type HubListOptions,
} from "./store.ts";
import { LocalHostAdapter } from "./local-host-adapter.ts";
import type { HubApplication, HubDeployment, HubUserSummary } from "./types.ts";
import {
  assertReleaseArtifactChecksum,
  resolveReleaseArtifactDirectory,
} from "./artifact-integrity.ts";

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

const PUBLIC_INTERNAL_ERROR_MESSAGE = "An unexpected internal error occurred.";
const JSON_CONTENT_TYPE = "application/json";

export function createHubApi(
  deps: HubApiDeps,
  options: HubApiOptions = {},
): HubApi {
  const store = new HubStore(deps.database.connection);
  const authorization = new HubAuthorization(store);
  const host = new LocalHostAdapter({
    registry: deps.registry,
    releaseRoot: deps.releaseRoot,
    appAuthSecret: deps.appAuthSecret,
  });
  const coordinator = new DeploymentCoordinator(store, host);
  const api = new Hono<HubApiEnvironment>() as HubApi;
  let setupTail: Promise<void> = Promise.resolve();
  let ready: Promise<void> = deps.database.ready;

  api.use("*", async (context, next) => {
    await ready;
    const requestId =
      context.req.header("x-request-id")?.trim() || crypto.randomUUID();
    context.set("requestId", requestId);
    await next();
  });

  api.use("*", async (context, next) => {
    assertSecureMutation(context.req.raw, deps.authoritativeOrigin);
    await next();
  });

  api.onError((error, context) =>
    errorResponse(
      context,
      error,
      context.get("requestId") ?? crypto.randomUUID(),
    ),
  );

  api.get("/healthz", (context) =>
    successResponse(context, {
      ok: true,
      appName: deps.appName,
      basePath: deps.publicBasePath,
      host: host.available() ? "available" : "unavailable",
    }),
  );

  api.get("/setup/status", async (context) => {
    const setupRequired = await store.isSetupRequired();
    return successResponse(context, {
      setupRequired,
      ownerConfigured: !setupRequired,
    });
  });

  api.post("/setup/owner", async (context) => {
    const body = await jsonBody(context);
    const result = await withSetupLock(async () => {
      if (!(await store.isSetupRequired())) {
        throw new HubDomainError(
          "SETUP_ALREADY_COMPLETED",
          "Hub setup is already complete.",
          {
            status: 409,
          },
        );
      }
      const reservationToken = crypto.randomUUID();
      await store.reserveOwnerSetup(reservationToken);
      try {
        const email = requiredString(body.email, "email");
        const password = requiredString(body.password, "password");
        const name = requiredString(body.name, "name");
        const username = optionalString(body.username);
        const bootstrap = deps.bootstrapAuth;
        const signupUrl = new URL(context.req.url);
        signupUrl.pathname = signupUrl.pathname.replace(
          /\/setup\/owner\/?$/,
          "/auth/sign-up/email",
        );
        const signupRequest = new Request(signupUrl, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json",
            origin: context.req.header("origin")!,
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
              "INTERNAL_ERROR",
              PUBLIC_INTERNAL_ERROR_MESSAGE,
              { status: 500, retryable: true },
            );
          }
          throw new HubDomainError(
            stringProperty(signupPayload, "code") ?? "OWNER_SIGNUP_FAILED",
            stringProperty(signupPayload, "message") ??
              "Unable to create the first owner.",
            {
              status:
                signupResponse.status >= 400 ? signupResponse.status : 422,
            },
          );
        }
        const user = signupPayload?.user;
        if (
          !user ||
          typeof user !== "object" ||
          !("id" in user) ||
          typeof user.id !== "string"
        ) {
          throw new HubDomainError(
            "OWNER_SIGNUP_INVALID_RESPONSE",
            "Authentication did not return a user.",
            {
              status: 502,
            },
          );
        }
        await store.initializeOwner({
          userId: user.id,
          reservationToken,
          requestId: context.get("requestId"),
        });
        return {
          payload: signupPayload,
          setCookie: signupResponse.headers.get("set-cookie"),
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
    if (result.setCookie) response.headers.set("set-cookie", result.setCookie);
    return response;
  });

  api.on(["GET", "POST"], "/auth/*", async (context) => {
    if (context.req.path.includes("/sign-up")) {
      return errorResponse(
        context,
        new HubDomainError(
          "PUBLIC_SIGNUP_DISABLED",
          "Public sign-up is disabled.",
          { status: 403 },
        ),
        context.get("requestId"),
      );
    }
    return deps.auth.handler(context.req.raw);
  });

  api.get("/me", async (context) => {
    const actor = await requireActor(context, deps.auth, authorization);
    return successResponse(context, actor);
  });

  api.get("/apps", async (context) => {
    const actor = await requireActor(context, deps.auth, authorization);
    await authorization.require(actor.user.id, {
      resource: "hub.app",
      action: "read",
    });
    const result = await store.listApplications(readPagination(context));
    return successResponse(context, result.items, pageMeta(result));
  });

  api.post("/apps", async (context) => {
    const actor = await requireActor(context, deps.auth, authorization);
    await authorization.require(actor.user.id, {
      resource: "hub.app",
      action: "create",
    });
    const body = await jsonBody(context);
    const application = await store.createApplication(
      {
        slug: requiredString(body.slug, "slug"),
        name: requiredString(body.name, "name"),
        description: optionalString(body.description),
      } satisfies CreateApplicationInput,
      actor.user.id,
    );
    return successResponse(context, application, undefined, 201);
  });

  api.get("/apps/:id", async (context) => {
    const actor = await requireActor(context, deps.auth, authorization);
    const application = await requireAuthorizedApplication(
      store,
      authorization,
      actor.user.id,
      context.req.param("id"),
      "read",
    );
    return successResponse(context, application);
  });

  api.get("/apps/:id/releases", async (context) => {
    const actor = await requireActor(context, deps.auth, authorization);
    const applicationId = context.req.param("id");
    await requireAuthorizedApplication(
      store,
      authorization,
      actor.user.id,
      applicationId,
      "read",
      "hub.release",
    );
    const result = await store.listReleases(
      applicationId,
      readPagination(context),
    );
    return successResponse(context, result.items, pageMeta(result));
  });

  api.post("/apps/:id/releases", async (context) => {
    const actor = await requireActor(context, deps.auth, authorization);
    const applicationId = context.req.param("id");
    const application = await requireAuthorizedApplication(
      store,
      authorization,
      actor.user.id,
      applicationId,
      "create",
      "hub.release",
    );
    const body = await jsonBody(context);
    const checksum = requiredString(body.checksum, "checksum");
    const storageKey = optionalString(body.storageKey);
    const releaseDirectory = resolveReleaseArtifactDirectory({
      releaseRoot: deps.releaseRoot,
      applicationSlug: application.slug,
      storageKey,
    });
    await assertReleaseArtifactChecksum(releaseDirectory, checksum);
    const result = await store.createRelease(
      applicationId,
      {
        version: requiredString(body.version, "version"),
        checksum,
        manifest: objectValue(body.manifest, "manifest"),
        storageKey,
        sizeBytes: typeof body.sizeBytes === "number" ? body.sizeBytes : null,
        sourceCommit: optionalString(body.sourceCommit),
      } satisfies CreateReleaseInput,
      actor.user.id,
    );
    return successResponse(
      context,
      result.release,
      { idempotent: !result.created },
      result.created ? 201 : 200,
    );
  });

  api.get("/apps/:id/deployments", async (context) => {
    const actor = await requireActor(context, deps.auth, authorization);
    const applicationId = context.req.param("id");
    await requireAuthorizedApplication(
      store,
      authorization,
      actor.user.id,
      applicationId,
      "read",
      "hub.deployment",
    );
    const result = await store.listDeployments({
      ...readPagination(context),
      applicationId,
    });
    return successResponse(context, result.items, pageMeta(result));
  });

  api.post("/apps/:id/deployments", async (context) => {
    const actor = await requireActor(context, deps.auth, authorization);
    const applicationId = context.req.param("id");
    await requireAuthorizedApplication(
      store,
      authorization,
      actor.user.id,
      applicationId,
      "create",
      "hub.deployment",
    );
    const body = await jsonBody(context);
    const targetReleaseId = requiredString(
      body.targetReleaseId,
      "targetReleaseId",
    );
    const result = await store.createDeployment(
      applicationId,
      {
        targetReleaseId,
        type: deploymentType(body.type),
        idempotencyKey:
          context.req.header("idempotency-key")?.trim() ||
          optionalString(body.idempotencyKey),
      } satisfies CreateDeploymentInput,
      actor.user.id,
    );
    if (result.created) void coordinator.schedule(result.deployment);
    return successResponse(
      context,
      result.deployment,
      { idempotent: !result.created },
      202,
    );
  });

  api.get("/deployments", async (context) => {
    const actor = await requireActor(context, deps.auth, authorization);
    await authorization.require(actor.user.id, {
      resource: "hub.deployment",
      action: "read",
    });
    const result = await store.listDeployments(readPagination(context));
    return successResponse(context, result.items, pageMeta(result));
  });

  api.get("/deployments/:id/events", async (context) => {
    const actor = await requireActor(context, deps.auth, authorization);
    const deployment = await requireAuthorizedDeployment(
      store,
      authorization,
      actor.user.id,
      context.req.param("id"),
    );
    return successResponse(
      context,
      await store.listDeploymentEvents(deployment.id),
    );
  });

  api.get("/deployments/:id", async (context) => {
    const actor = await requireActor(context, deps.auth, authorization);
    const deployment = await requireAuthorizedDeployment(
      store,
      authorization,
      actor.user.id,
      context.req.param("id"),
    );
    return successResponse(context, deployment);
  });

  ready = deps.database.ready.then(async (): Promise<void> => {
    if (options.recoverDeployments === false) return;
    await coordinator.recover();
    await coordinator.reconcileActiveRuntimes();
  });
  Object.defineProperties(api, {
    ready: { configurable: false, enumerable: false, value: ready },
    close: {
      configurable: false,
      enumerable: false,
      value: (): Promise<void> => coordinator.drain(),
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

class DeploymentCoordinator {
  private readonly running = new Map<string, Promise<void>>();

  constructor(
    private readonly store: HubStore,
    private readonly host: LocalHostAdapter,
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
      if (deployment.status === "queued" || deployment.status === "preparing") {
        operations.push(this.schedule(deployment));
        continue;
      }
      const message =
        "Hub restarted after the Host operation began; deployment outcome cannot be proven safely.";
      await this.store.updateDeployment(deployment.id, {
        status: "failed",
        finishedAt: new Date().toISOString(),
        failureCode: "HUB_RESTARTED_DURING_DEPLOYMENT",
        failureMessage: message,
      });
      await this.store.appendDeploymentEvent(deployment.id, {
        type: "failed",
        status: "failed",
        message,
        details: { code: "HUB_RESTARTED_DURING_DEPLOYMENT" },
      });
    }
    await Promise.all(operations);
  }

  async reconcileActiveRuntimes(): Promise<void> {
    if (!this.host.available()) return;
    const active = await this.store.listActiveApplicationReleases();
    for (const projection of active) {
      if (this.running.has(projection.application.id)) continue;
      await this.host.restore(projection.application, projection.release);
    }
  }

  async drain(): Promise<void> {
    await Promise.allSettled([...this.running.values()]);
  }

  private async run(deployment: HubDeployment): Promise<void> {
    let result: AppDeploymentResult;
    try {
      await this.transition(
        deployment,
        "preparing",
        "preparing",
        "Preparing release.",
      );
      const application = await this.store.requireApplication(
        deployment.applicationId,
      );
      const release = await this.store.getRelease(deployment.targetReleaseId);
      if (!release)
        throw new HubDomainError(
          "RELEASE_NOT_FOUND",
          "Deployment release was removed.",
          { status: 404 },
        );
      if (deployment.previousReleaseId) {
        const previousRelease = await this.store.getRelease(
          deployment.previousReleaseId,
        );
        if (!previousRelease) {
          throw new HubDomainError(
            "PREVIOUS_RELEASE_NOT_FOUND",
            "The previous active release required for deployment recovery was not found.",
            { status: 500 },
          );
        }
        await this.host.restore(application, previousRelease);
      }
      await this.transition(
        deployment,
        "activating",
        "activating",
        "Activating release.",
      );
      result = await this.host.deploy({
        application,
        release,
        deployment,
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
        return;
      } catch (error) {
        logServerError(error, {
          operation: "deployment-control-plane-commit",
          deploymentId: deployment.id,
          attempt,
          hostOperationId: result.operationId,
        });
      }
    }
  }

  private async recordPostHostProgress(
    deployment: HubDeployment,
    result: AppDeploymentResult,
  ): Promise<void> {
    await this.transition(
      deployment,
      "checking",
      "checking",
      "Checking runtime readiness.",
      result,
    );
    await this.transition(
      deployment,
      "switching",
      "switching",
      "Switching active release.",
      result,
    );
    await this.transition(
      deployment,
      "draining",
      "draining",
      "Draining previous runtime.",
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
        return;
      } catch (error) {
        logServerError(error, {
          operation: "deployment-recovery-commit",
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
      operation: "deployment",
      deploymentId: deployment.id,
      code: domainError.code,
    });
    await this.store
      .updateDeployment(deployment.id, {
        status: "failed",
        finishedAt: new Date().toISOString(),
        failureCode: domainError.code,
        failureMessage: domainError.message,
      })
      .catch(() => undefined);
    await this.store
      .appendDeploymentEvent(deployment.id, {
        type: "failed",
        status: "failed",
        message: domainError.message,
        details: { code: domainError.code },
      })
      .catch(() => undefined);
  }

  private async transition(
    deployment: HubDeployment,
    status: HubDeployment["status"],
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

async function requireActor(
  context: Parameters<typeof successResponse>[0],
  auth: Auth,
  authorization: HubAuthorization,
): Promise<AuthorizedHubActor> {
  const session = await auth.getSession(context.req.raw.headers);
  if (!session) {
    throw new HubDomainError("UNAUTHORIZED", "Authentication required.", {
      status: 401,
    });
  }
  const actor = await authorization.actor(toUserSummary(session));
  context.set("actor", actor);
  return actor;
}

async function requireAuthorizedApplication(
  store: HubStore,
  authorization: HubAuthorization,
  userId: string,
  applicationId: string,
  action: HubAction,
  resource: HubResource = "hub.app",
): Promise<HubApplication> {
  if (
    !(await authorization.can(userId, {
      resource,
      action,
      applicationId,
    }))
  ) {
    throw concealedNotFound("APPLICATION_NOT_FOUND", applicationId);
  }
  return store.requireApplication(applicationId);
}

async function requireAuthorizedDeployment(
  store: HubStore,
  authorization: HubAuthorization,
  userId: string,
  deploymentId: string,
): Promise<HubDeployment> {
  const deployment = await store.getDeployment(deploymentId);
  if (
    !deployment ||
    !(await authorization.can(userId, {
      resource: "hub.deployment",
      action: "read",
      applicationId: deployment.applicationId,
    }))
  ) {
    throw concealedNotFound("DEPLOYMENT_NOT_FOUND", deploymentId);
  }
  return deployment;
}

function concealedNotFound(code: string, id: string): HubDomainError {
  const resource =
    code === "DEPLOYMENT_NOT_FOUND" ? "Deployment" : "Application";
  return new HubDomainError(code, `${resource} "${id}" was not found.`, {
    status: 404,
  });
}

function toUserSummary(session: AuthSession): HubUserSummary {
  if (!session) {
    throw new HubDomainError("UNAUTHORIZED", "Authentication required.", {
      status: 401,
    });
  }
  const user = session.user;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    username:
      "username" in user && typeof user.username === "string"
        ? user.username
        : null,
  };
}

function readPagination(
  context: Parameters<typeof successResponse>[0],
): HubListOptions {
  const limit = Number(context.req.query("limit") ?? 20);
  const offset = Number(context.req.query("offset") ?? 0);
  return {
    limit: Number.isFinite(limit) ? limit : 20,
    offset: Number.isFinite(offset) ? offset : 0,
  };
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
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("object required");
    }
    return body as Record<string, unknown>;
  } catch {
    throw new HubDomainError(
      "INVALID_JSON",
      "Request body must be a JSON object.",
      { status: 400 },
    );
  }
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    const message = `${field} is required.`;
    throw new HubDomainError("VALIDATION_ERROR", message, {
      status: 422,
      issues: [{ path: field, code: "required", message }],
    });
  }
  return value.trim();
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function objectValue(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HubDomainError(
      "VALIDATION_ERROR",
      `${field} must be an object.`,
      {
        status: 422,
        issues: [
          {
            path: field,
            code: "invalid_type",
            message: `${field} must be an object.`,
          },
        ],
      },
    );
  }
  return value as Record<string, unknown>;
}

function deploymentType(value: unknown): CreateDeploymentInput["type"] {
  if (value === undefined || value === null || value === "") return "deploy";
  if (value === "deploy" || value === "rollback" || value === "redeploy")
    return value;
  throw new HubDomainError(
    "VALIDATION_ERROR",
    "type must be deploy, rollback, or redeploy.",
    {
      status: 422,
      issues: [
        {
          path: "type",
          code: "invalid_value",
          message: "type must be deploy, rollback, or redeploy.",
        },
      ],
    },
  );
}

function successResponse(
  context: HubContext,
  data: unknown,
  meta: Record<string, unknown> = {},
  status: ContentfulStatusCode = 200,
): Response {
  const requestId = context.get("requestId") ?? crypto.randomUUID();
  return context.json({ data, meta, requestId }, status);
}

function assertSecureMutation(
  request: Request,
  authoritativeOrigin?: string,
): void {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;

  const contentType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (contentType !== JSON_CONTENT_TYPE) {
    throw new HubDomainError(
      "UNSUPPORTED_MEDIA_TYPE",
      "Hub mutation requests must use application/json.",
      { status: 415 },
    );
  }

  const origin = parseOrigin(request.headers.get("origin") ?? undefined);
  const trustedOrigins = resolveMutationOrigins(request, authoritativeOrigin);
  if (!origin || !trustedOrigins.has(origin)) {
    throw new HubDomainError(
      "UNTRUSTED_ORIGIN",
      "Hub mutation requests must come from the Hub origin.",
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

  const port = effectiveUrl.port ? `:${effectiveUrl.port}` : "";
  for (const hostname of ["localhost", "127.0.0.1", "[::1]"]) {
    origins.add(`${effectiveUrl.protocol}//${hostname}${port}`);
  }
  return origins;
}

function parseOrigin(value: string | undefined): string | undefined {
  if (!value || value === "null") return undefined;
  try {
    const url = new URL(value);
    if (url.origin === "null") return undefined;
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
    logServerError(error, { operation: "request", requestId });
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
  return new HubDomainError("INTERNAL_ERROR", PUBLIC_INTERNAL_ERROR_MESSAGE, {
    status: 500,
    retryable: true,
    cause: error,
  });
}

function logServerError(
  error: unknown,
  context: Record<string, unknown>,
): void {
  console.error("Hub server error", { ...context, error });
}

async function readResponseJson(
  response: Response,
): Promise<Record<string, unknown>> {
  try {
    const value: unknown = await response.json();
    return value && typeof value === "object"
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
  return typeof property === "string" ? property : undefined;
}
