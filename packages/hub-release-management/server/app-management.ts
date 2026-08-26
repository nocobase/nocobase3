import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { Hono } from 'hono';

import type { ReleaseAuthorizer } from './authorization.js';
import { AppHostClient } from './app-host-client.js';
import { ReleaseManagementError } from './errors.js';
import type { ManagedAppRecord, ManagedAppStore } from './managed-app-store.js';
import type {
  AppReleaseUploadResult,
  CreateManagedAppInput,
  CreateManagedAppResult,
  ManagedAppSummary,
  ReleaseActor,
  RotateDeployTokenResult,
} from './types.js';

const DEPLOY_TOKEN_PREFIX = 'nb3_app_';
const RELEASE_MEDIA_TYPE = 'application/vnd.nocobase.release+tar+gzip';
const RESERVED_APP_IDS = new Set([
  '__apps',
  '__health',
  'api',
  'assets',
  'healthz',
  'hub',
]);

export interface AppManagementRoutesOptions {
  service: AppManagementService;
  authorize: ReleaseAuthorizer;
}

export class AppManagementService {
  constructor(
    private readonly appHost: AppHostClient,
    readonly store: ManagedAppStore,
  ) {}

  async list(): Promise<ManagedAppSummary[]> {
    return (await this.store.list()).map(toSummary);
  }

  async create(
    input: CreateManagedAppInput,
    actor: ReleaseActor,
  ): Promise<CreateManagedAppResult> {
    const appId = validateAppId(input.appId);
    const name = validateAppName(input.name);
    const host = await this.appHost.overview();
    if (
      host.active.some((app) => app.id === appId) ||
      host.definitions.some((app) => app.id === appId) ||
      host.releases.some((release) => release.appId === appId)
    ) {
      throw appAlreadyExists(appId);
    }

    const deployToken = generateDeployToken();
    const createdAt = new Date().toISOString();
    const record: ManagedAppRecord = {
      appId,
      name,
      status: 'not-deployed',
      createdAt,
      createdBy: actor,
      deployTokenHash: hashDeployToken(deployToken),
      deployTokenIssuedAt: createdAt,
      deployTokenIssuedBy: actor,
    };
    if (!(await this.store.create(record))) {
      throw appAlreadyExists(appId);
    }
    return { app: toSummary(record), deployToken };
  }

  async rotateDeployToken(
    appIdInput: string,
    actor: ReleaseActor,
  ): Promise<RotateDeployTokenResult> {
    const appId = validateAppId(appIdInput);
    const record = await this.store.find(appId);
    if (!record) {
      throw new ReleaseManagementError(`App ${appId} does not exist`, {
        status: 404,
        code: 'APP_NOT_FOUND',
      });
    }
    const deployToken = generateDeployToken();
    await this.store.save({
      ...record,
      deployTokenHash: hashDeployToken(deployToken),
      deployTokenIssuedAt: new Date().toISOString(),
      deployTokenIssuedBy: actor,
    });
    return { deployToken };
  }

  async authorizeDeployToken(
    token: string,
    targetAppId: string,
  ): Promise<ReleaseActor> {
    const appId = validateAppId(targetAppId);
    if (!isWellFormedDeployToken(token)) {
      throw invalidDeployToken();
    }
    const tokenHash = hashDeployToken(token);
    const records = await this.store.list();
    const owner = records.find((candidate) =>
      hashesEqual(candidate.deployTokenHash, tokenHash),
    );
    if (!owner) {
      throw invalidDeployToken();
    }
    if (owner.appId !== appId) {
      throw new ReleaseManagementError(
        'App deploy token cannot access another App',
        { status: 403, code: 'APP_DEPLOY_TOKEN_FORBIDDEN' },
      );
    }
    return {
      id: `app:${owner.appId}`,
      name: `${owner.name} deploy token`,
      role: 'app-deployer',
    };
  }

  async uploadRelease(
    appIdInput: string,
    releaseIdInput: string,
    request: Request,
  ): Promise<{ result: AppReleaseUploadResult; status: 200 | 201 }> {
    const appId = validateAppId(appIdInput);
    const releaseId = validateReleaseId(releaseIdInput);
    await this.requireManagedApp(appId);
    const contentType = request.headers.get('content-type')?.split(';', 1)[0];
    if (contentType !== RELEASE_MEDIA_TYPE) {
      throw new ReleaseManagementError(
        `Release upload must use ${RELEASE_MEDIA_TYPE}`,
        { status: 415, code: 'APP_RELEASE_MEDIA_TYPE_UNSUPPORTED' },
      );
    }
    if (!request.body) {
      throw new ReleaseManagementError('Release upload body is required', {
        status: 400,
        code: 'APP_RELEASE_BODY_REQUIRED',
      });
    }
    return this.appHost.uploadRelease(
      appId,
      releaseId,
      request.body,
      contentType,
    );
  }

  private async requireManagedApp(
    appIdInput: string,
  ): Promise<ManagedAppRecord> {
    const appId = validateAppId(appIdInput);
    const record = await this.store.find(appId);
    if (!record) {
      throw new ReleaseManagementError(`App ${appId} does not exist`, {
        status: 404,
        code: 'APP_NOT_FOUND',
      });
    }
    return record;
  }
}

export function createAppManagementRoutes(
  options: AppManagementRoutesOptions,
): Hono {
  const routes = new Hono();

  routes.onError((error) => {
    const known = error instanceof ReleaseManagementError;
    if (!known || error.status >= 500) console.error(error);
    return Response.json(
      {
        error: error.message,
        code: known ? error.code : 'APP_MANAGEMENT_ERROR',
      },
      { status: known ? error.status : 500 },
    );
  });

  routes.get('/', async (context) => {
    await options.authorize(context.req.raw);
    return context.json({ apps: await options.service.list() });
  });

  routes.post('/', async (context) => {
    const actor = await options.authorize(context.req.raw);
    const body = await readJsonObject(context.req.raw);
    const result = await options.service.create(
      {
        appId: typeof body.appId === 'string' ? body.appId : '',
        name: typeof body.name === 'string' ? body.name : '',
      },
      actor,
    );
    return context.json(result, 201);
  });

  routes.post('/:appId/deploy-token', async (context) => {
    const actor = await options.authorize(context.req.raw);
    return context.json(
      await options.service.rotateDeployToken(
        context.req.param('appId'),
        actor,
      ),
    );
  });

  routes.put('/:appId/releases/:releaseId', async (context) => {
    const request = context.req.raw;
    const bearer = readBearerToken(request);
    if (bearer && isAppDeployToken(bearer)) {
      await options.service.authorizeDeployToken(
        bearer,
        context.req.param('appId'),
      );
    } else {
      await options.authorize(request);
    }
    const uploaded = await options.service.uploadRelease(
      context.req.param('appId'),
      context.req.param('releaseId'),
      request,
    );
    return context.json(uploaded.result, uploaded.status);
  });

  return routes;
}

export function readBearerToken(request: Request): string | null {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return null;
  const value = authorization.slice('Bearer '.length).trim();
  return value || null;
}

export function validateAppId(value: string): string {
  const appId = value.trim();
  if (
    !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(appId) ||
    RESERVED_APP_IDS.has(appId.toLowerCase())
  ) {
    throw new ReleaseManagementError(
      'appId must match the App Host runtime identifier format',
      {
        status: 400,
        code: 'INVALID_APP_ID',
      },
    );
  }
  return appId;
}

export function validateReleaseId(value: string): string {
  const releaseId = value.trim();
  if (
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(releaseId) ||
    releaseId === '.' ||
    releaseId === '..'
  ) {
    throw new ReleaseManagementError('releaseId must be a safe path segment', {
      status: 400,
      code: 'INVALID_RELEASE_ID',
    });
  }
  return releaseId;
}

function validateAppName(value: string): string {
  const name = value.trim();
  if (
    !name ||
    name.length > 80 ||
    [...name].some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127;
    })
  ) {
    throw new ReleaseManagementError(
      'name must contain 1 to 80 visible characters',
      { status: 400, code: 'INVALID_APP_NAME' },
    );
  }
  return name;
}

function generateDeployToken(): string {
  return `${DEPLOY_TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;
}

function hashDeployToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function hashesEqual(left: string, right: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right)) {
    return false;
  }
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

export function isAppDeployToken(token: string): boolean {
  return token.startsWith(DEPLOY_TOKEN_PREFIX);
}

function isWellFormedDeployToken(token: string): boolean {
  return /^nb3_app_[A-Za-z0-9_-]{43}$/.test(token);
}

function invalidDeployToken(): ReleaseManagementError {
  return new ReleaseManagementError('App deploy token is invalid', {
    status: 401,
    code: 'APP_DEPLOY_TOKEN_INVALID',
  });
}

function toSummary(record: ManagedAppRecord): ManagedAppSummary {
  return {
    appId: record.appId,
    name: record.name,
    status: record.status,
    createdAt: record.createdAt,
    createdBy: structuredClone(record.createdBy),
  };
}

function appAlreadyExists(appId: string): ReleaseManagementError {
  return new ReleaseManagementError(`App ${appId} already exists`, {
    status: 409,
    code: 'APP_ALREADY_EXISTS',
  });
}

async function readJsonObject(
  request: Request,
): Promise<Record<string, unknown>> {
  try {
    const value = (await request.json()) as unknown;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  } catch {
    // Report one stable validation error below.
  }
  throw new ReleaseManagementError('Request body must be a JSON object', {
    status: 400,
    code: 'INVALID_JSON_BODY',
  });
}
