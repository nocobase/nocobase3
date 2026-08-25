export type AgentScope =
  | 'profile'
  | 'apps:create'
  | 'apps:read'
  | 'source:read'
  | 'source:write'
  | 'releases:read'
  | 'releases:publish'
  | 'deployments:read'
  | 'deployments:deploy'
  | 'deployments:rollback'
  | 'deployments:redeploy'
  | 'runtime:read'
  | 'runtime:control';

export const AGENT_SCOPES: readonly AgentScope[] = [
  'profile',
  'apps:create',
  'apps:read',
  'source:read',
  'source:write',
  'releases:read',
  'releases:publish',
  'deployments:read',
  'deployments:deploy',
  'deployments:rollback',
  'deployments:redeploy',
  'runtime:read',
  'runtime:control',
];

export type AgentApplicationScope =
  | { mode: 'all-authorized' }
  | { mode: 'selected'; applicationIds: readonly string[] };

export interface DeviceAuthorizationInput {
  clientId: string;
  clientName: string;
  scopes: readonly AgentScope[];
  applicationScope: AgentApplicationScope;
}

export interface DeviceAuthorization {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete?: string;
  expiresIn: number;
  interval: number;
}

export type TokenExchangeInput =
  | {
      grantType: 'urn:ietf:params:oauth:grant-type:device_code';
      clientId: string;
      deviceCode: string;
    }
  | {
      grantType: 'refresh_token';
      clientId: string;
      refreshToken: string;
    };

export interface AgentToken {
  credentialId: string;
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  refreshToken: string;
  refreshExpiresIn: number;
  scope: string;
  applicationScope: AgentApplicationScope;
}

export interface ApplicationSummary {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  status: string;
  isDefault?: boolean;
  latestRelease?: { id?: string; version: string } | null;
  activeRelease?: { id?: string; version: string } | null;
  runtime?: { state: string; health: string } | null;
  links?: { open?: string | null };
  [key: string]: unknown;
}

export interface RepositoryMetadata {
  applicationId: string;
  provider: string;
  cloneUrl: string;
  defaultBranch: string;
  headCommit: string;
  status: string;
  initialCommit?: string;
  updatedAt: string;
  [key: string]: unknown;
}

export interface PageMeta {
  total: number;
  limit: number;
  offset: number;
}

export interface ApplicationListOptions {
  query?: string;
  statuses?: readonly ('active' | 'archived')[];
  sort?: string;
  limit?: number;
  offset?: number;
}

export interface ApplicationPage {
  items: ApplicationSummary[];
  meta: PageMeta;
  requestId?: string;
}

export interface CreateApplicationInput {
  slug: string;
  name: string;
  description?: string;
}

export interface ReleaseUploadInput {
  version: string;
  sourceCommit: string;
  checksum: string;
  sizeBytes: number;
  archiveChecksum: string;
  archiveSizeBytes: number;
  archiveFormat: 'tar.gz';
  manifest: Record<string, unknown>;
}

export interface ReleaseUpload {
  id: string;
  applicationId: string;
  status: string;
  version: string;
  sourceCommit: string;
  expiresAt?: string;
  failure?: { code: string; message: string } | null;
  upload: {
    method: 'PUT';
    url: string;
    auth?: { mode: 'hub-bearer' };
    headers?: Record<string, string>;
  };
  release?: { id: string; version: string; [key: string]: unknown } | null;
  [key: string]: unknown;
}

export interface DeploymentInput {
  targetReleaseId: string;
  type?: 'deploy' | 'rollback' | 'redeploy';
}

export interface Deployment {
  id: string;
  applicationId: string;
  targetReleaseId: string;
  type: string;
  status: string;
  [key: string]: unknown;
}

export interface Release {
  id: string;
  applicationId: string;
  version: string;
  sourceCommit?: string | null;
  checksum?: string;
  [key: string]: unknown;
}

export interface ResourceListOptions {
  limit?: number;
  offset?: number;
}

interface SuccessEnvelope<T> {
  data: T;
  meta?: Record<string, unknown>;
  requestId?: string;
}

interface ErrorEnvelope {
  error?: {
    code?: string;
    message?: string;
    retryable?: boolean;
    issues?: unknown;
  };
  requestId?: string;
}

export class HubApiError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly requestId?: string;
  public readonly retryable: boolean;
  public readonly issues?: unknown;

  public constructor(
    message: string,
    options: {
      code: string;
      status: number;
      requestId?: string;
      retryable?: boolean;
      issues?: unknown;
    },
  ) {
    super(message);
    this.name = 'HubApiError';
    this.code = options.code;
    this.status = options.status;
    this.requestId = options.requestId;
    this.retryable = options.retryable ?? false;
    this.issues = options.issues;
  }
}

export class HubNetworkError extends Error {
  public readonly code = 'HUB_UNREACHABLE';
  public readonly retryable = true;

  public constructor(hub: string, cause: unknown) {
    super(`Unable to reach Hub ${hub}.`, { cause });
    this.name = 'HubNetworkError';
  }
}

export class HubProtocolError extends Error {
  public readonly code = 'INVALID_HUB_RESPONSE';
  public readonly retryable = false;

  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'HubProtocolError';
  }
}

export interface HubClientOptions {
  accessToken?: string;
  fetch?: typeof fetch;
}

export function normalizeHubUrl(value: string): string {
  const input = value.trim();
  let url: URL;
  try {
    url = new URL(input);
  } catch (cause) {
    throw new Error(
      `Invalid Hub URL "${value}". Use the public Hub root, for example http://127.0.0.1:13000/hub.`,
      { cause },
    );
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Hub URL must use http or https.');
  }
  if (url.username || url.password) {
    throw new Error('Hub URL must not contain credentials.');
  }
  if (url.search || url.hash) {
    throw new Error('Hub URL must not contain a query or fragment.');
  }
  const pathname = url.pathname.replace(/\/+$/g, '');
  return `${url.origin}${pathname === '/' ? '' : pathname}`;
}

export class HubClient {
  public readonly hub: string;
  private readonly accessToken?: string;
  private readonly fetcher: typeof fetch;

  public constructor(hub: string, options: HubClientOptions = {}) {
    this.hub = normalizeHubUrl(hub);
    this.accessToken = options.accessToken;
    this.fetcher = options.fetch ?? globalThis.fetch;
  }

  public createDeviceAuthorization(
    input: DeviceAuthorizationInput,
  ): Promise<DeviceAuthorization> {
    return this.request<DeviceAuthorization>('/agent-auth/device', {
      authenticated: false,
      body: input,
      method: 'POST',
    });
  }

  public exchangeToken(input: TokenExchangeInput): Promise<AgentToken> {
    return this.request<AgentToken>('/agent-auth/token', {
      authenticated: false,
      body: input,
      method: 'POST',
    });
  }

  public async revoke(refreshToken: string, clientId: string): Promise<void> {
    await this.request<{ revoked: boolean }>('/agent-auth/revoke', {
      authenticated: false,
      body: { clientId, refreshToken },
      method: 'POST',
    });
  }

  public async listApplications(
    options: ApplicationListOptions = {},
  ): Promise<ApplicationPage> {
    const query = new URLSearchParams();
    query.set('limit', String(options.limit ?? 20));
    query.set('offset', String(options.offset ?? 0));
    if (options.query) query.set('query', options.query);
    for (const status of options.statuses ?? []) query.append('status', status);
    if (options.sort) query.set('sort', options.sort);
    const envelope = await this.requestEnvelope<ApplicationSummary[]>(
      `/apps?${query.toString()}`,
      { authenticated: true, method: 'GET' },
    );
    const meta = envelope.meta ?? {};
    return {
      items: envelope.data,
      meta: {
        total: numberValue(meta.total, envelope.data.length),
        limit: numberValue(meta.limit, options.limit ?? 20),
        offset: numberValue(meta.offset, options.offset ?? 0),
      },
      requestId: envelope.requestId,
    };
  }

  public getRepository(applicationId: string): Promise<RepositoryMetadata> {
    return this.request<RepositoryMetadata>(
      `/apps/${encodeURIComponent(applicationId)}/repository`,
      { authenticated: true, method: 'GET' },
    );
  }

  public createApplication(
    input: CreateApplicationInput,
    idempotencyKey: string,
  ): Promise<ApplicationSummary> {
    return this.request<ApplicationSummary>('/apps', {
      authenticated: true,
      body: input,
      headers: { 'idempotency-key': idempotencyKey },
      method: 'POST',
    });
  }

  public getApplication(applicationId: string): Promise<ApplicationSummary> {
    return this.request<ApplicationSummary>(
      `/apps/${encodeURIComponent(applicationId)}`,
      { authenticated: true, method: 'GET' },
    );
  }

  public createReleaseUpload(
    applicationId: string,
    input: ReleaseUploadInput,
    idempotencyKey: string,
  ): Promise<ReleaseUpload> {
    return this.request<ReleaseUpload>(
      `/apps/${encodeURIComponent(applicationId)}/release-uploads`,
      {
        authenticated: true,
        body: input,
        headers: { 'idempotency-key': idempotencyKey },
        method: 'POST',
      },
    );
  }

  public async putReleaseUploadContent(
    upload: ReleaseUpload,
    content: Uint8Array,
  ): Promise<void> {
    assertHubUploadUrl(upload.upload.url, this.hub, upload.id);
    if (upload.upload.auth?.mode !== 'hub-bearer') {
      throw new HubProtocolError(
        'Hub returned an upload URL without hub-bearer authentication.',
      );
    }
    const headers: Record<string, string> = {
      accept: 'application/json',
      authorization: this.requireAccessToken(),
      'content-length': String(content.byteLength),
      'content-type':
        upload.upload.headers?.['Content-Type'] ?? 'application/gzip',
    };
    let response: Response;
    try {
      response = await this.fetcher(upload.upload.url, {
        method: 'PUT',
        headers,
        body: content,
      });
    } catch (cause) {
      throw new HubNetworkError(this.hub, cause);
    }
    if (!response.ok) await this.throwResponseError(response);
  }

  public completeReleaseUpload(
    uploadId: string,
    idempotencyKey?: string,
  ): Promise<ReleaseUpload> {
    return this.request<ReleaseUpload>(
      `/release-uploads/${encodeURIComponent(uploadId)}/complete`,
      {
        authenticated: true,
        ...(idempotencyKey
          ? { headers: { 'idempotency-key': idempotencyKey } }
          : {}),
        method: 'POST',
        body: {},
      },
    );
  }

  public getReleaseUpload(uploadId: string): Promise<ReleaseUpload> {
    return this.request<ReleaseUpload>(
      `/release-uploads/${encodeURIComponent(uploadId)}`,
      { authenticated: true, method: 'GET' },
    );
  }

  public listReleases(
    applicationId: string,
    options: ResourceListOptions = {},
  ): Promise<Release[]> {
    return this.request<Release[]>(
      `/apps/${encodeURIComponent(applicationId)}/releases?limit=${options.limit ?? 100}&offset=${options.offset ?? 0}`,
      { authenticated: true, method: 'GET' },
    );
  }

  public listDeployments(
    applicationId: string,
    options: ResourceListOptions = {},
  ): Promise<Deployment[]> {
    return this.request<Deployment[]>(
      `/apps/${encodeURIComponent(applicationId)}/deployments?limit=${options.limit ?? 100}&offset=${options.offset ?? 0}`,
      { authenticated: true, method: 'GET' },
    );
  }

  public createDeployment(
    applicationId: string,
    input: DeploymentInput,
    idempotencyKey: string,
  ): Promise<Deployment> {
    return this.request<Deployment>(
      `/apps/${encodeURIComponent(applicationId)}/deployments`,
      {
        authenticated: true,
        body: input,
        headers: { 'idempotency-key': idempotencyKey },
        method: 'POST',
      },
    );
  }

  public getDeployment(deploymentId: string): Promise<Deployment> {
    return this.request<Deployment>(
      `/deployments/${encodeURIComponent(deploymentId)}`,
      { authenticated: true, method: 'GET' },
    );
  }

  private async request<T>(path: string, options: RequestOptions): Promise<T> {
    return (await this.requestEnvelope<T>(path, options)).data;
  }

  private async requestEnvelope<T>(
    path: string,
    options: RequestOptions,
  ): Promise<SuccessEnvelope<T>> {
    const headers: Record<string, string> = {
      accept: 'application/json',
      ...(options.headers ?? {}),
    };
    if (options.body !== undefined)
      headers['content-type'] = 'application/json';
    if (options.authenticated) {
      if (!this.accessToken) {
        throw new HubApiError('Hub authentication is required.', {
          code: 'NOT_LOGGED_IN',
          status: 401,
        });
      }
      headers.authorization = `Bearer ${this.accessToken}`;
    }
    let response: Response;
    try {
      response = await this.fetcher(`${this.hub}/api${path}`, {
        method: options.method,
        headers,
        ...(options.body === undefined
          ? {}
          : { body: JSON.stringify(options.body) }),
      });
    } catch (cause) {
      throw new HubNetworkError(this.hub, cause);
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch (cause) {
      throw new HubProtocolError(
        `Hub returned a non-JSON response with HTTP ${response.status}.`,
        { cause },
      );
    }
    if (!response.ok) {
      const envelope = isRecord(payload) ? (payload as ErrorEnvelope) : {};
      throw new HubApiError(
        envelope.error?.message ??
          `Hub request failed with HTTP ${response.status}.`,
        {
          code: envelope.error?.code ?? 'HUB_REQUEST_FAILED',
          status: response.status,
          requestId: envelope.requestId,
          retryable: envelope.error?.retryable,
          issues: envelope.error?.issues,
        },
      );
    }
    if (!isRecord(payload) || !Object.hasOwn(payload, 'data')) {
      throw new HubProtocolError('Hub success response does not contain data.');
    }
    return payload as unknown as SuccessEnvelope<T>;
  }

  private requireAccessToken(): string {
    if (!this.accessToken) {
      throw new HubApiError('Hub authentication is required.', {
        code: 'NOT_LOGGED_IN',
        status: 401,
      });
    }
    return `Bearer ${this.accessToken}`;
  }

  private async throwResponseError(response: Response): Promise<never> {
    let payload: unknown;
    try {
      payload = await response.json();
    } catch (cause) {
      throw new HubProtocolError(
        `Hub returned a non-JSON response with HTTP ${response.status}.`,
        { cause },
      );
    }
    const envelope = isRecord(payload) ? (payload as ErrorEnvelope) : {};
    throw new HubApiError(
      envelope.error?.message ??
        `Hub request failed with HTTP ${response.status}.`,
      {
        code: envelope.error?.code ?? 'HUB_REQUEST_FAILED',
        status: response.status,
        requestId: envelope.requestId,
        retryable: envelope.error?.retryable,
        issues: envelope.error?.issues,
      },
    );
  }
}

function assertHubUploadUrl(
  urlValue: string,
  hubValue: string,
  uploadId: string,
): void {
  let url: URL;
  let hub: URL;
  try {
    url = new URL(urlValue);
    hub = new URL(`${hubValue}/`);
  } catch (cause) {
    throw new HubProtocolError('Hub returned an invalid release upload URL.', {
      cause,
    });
  }
  const prefix = `${hub.pathname.replace(/\/+$/g, '')}/api/release-uploads/`;
  if (
    url.origin !== hub.origin ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== `${prefix}${encodeURIComponent(uploadId)}/content`
  ) {
    throw new HubProtocolError(
      'Hub returned a release upload URL outside the configured Hub.',
    );
  }
}

interface RequestOptions {
  authenticated: boolean;
  body?: unknown;
  headers?: Record<string, string>;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
