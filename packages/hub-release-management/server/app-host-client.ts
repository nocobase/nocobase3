import { AppHostRequestError, ReleaseManagementError } from './errors.js';
import type {
  ActiveAppSummary,
  AppHostDeploymentResult,
  AppHostLifecycleResult,
  AppHostOverview,
  AppReleaseUploadResult,
  AppRuntimeResourceStatus,
  AppRuntimeResourceSummary,
  DeploymentKind,
  AppLifecycleAction,
} from './types.js';

export interface AppHostClientOptions {
  baseUrl: string | URL;
  controlToken?: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

export class AppHostClient {
  private readonly baseUrl: URL;
  private readonly controlToken?: string;
  private readonly timeoutMs: number;
  private readonly uploadTimeoutMs: number;
  private readonly request: typeof fetch;

  constructor(options: AppHostClientOptions) {
    this.baseUrl = new URL(options.baseUrl);
    this.controlToken = options.controlToken;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.uploadTimeoutMs = options.timeoutMs ?? 10 * 60_000;
    this.request = options.fetch ?? fetch;
  }

  async overview(): Promise<AppHostOverview> {
    const overview = await this.send<AppHostOverview>('/__apps');
    const active = await Promise.all(
      overview.active.map(async (app): Promise<ActiveAppSummary> => {
        if (!app.resources?.length) return app;
        return {
          ...app,
          resources: await this.readRuntimeResources(app),
        };
      }),
    );
    return { ...overview, active };
  }

  async deploy(
    appId: string,
    releaseId: string,
    kind: DeploymentKind,
  ): Promise<AppHostDeploymentResult> {
    const action = kind === 'rollback' ? 'rollback' : 'deploy';
    const payload = await this.send<{ deployment: AppHostDeploymentResult }>(
      `/__apps/${encodeURIComponent(appId)}/${action}`,
      {
        method: 'POST',
        body: JSON.stringify({ releaseId }),
      },
    );
    return payload.deployment;
  }

  async uploadRelease(
    appId: string,
    releaseId: string,
    body: ReadableStream<Uint8Array>,
    contentType: string,
  ): Promise<{ result: AppReleaseUploadResult; status: 200 | 201 }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.uploadTimeoutMs);
    timeout.unref?.();
    const headers = new Headers({
      accept: 'application/json',
      'content-type': contentType,
    });
    if (this.controlToken) {
      headers.set('authorization', `Bearer ${this.controlToken}`);
    }

    try {
      const init: RequestInit & { duplex: 'half' } = {
        method: 'PUT',
        headers,
        body,
        duplex: 'half',
        signal: controller.signal,
      };
      const response = await this.request(
        new URL(
          `/__apps/${encodeURIComponent(appId)}/releases/${encodeURIComponent(releaseId)}`,
          this.baseUrl,
        ),
        init,
      );
      const payload = await readJson(response);
      if (!response.ok) {
        const error = asRecord(payload);
        throw new AppHostRequestError(
          typeof error?.error === 'string'
            ? error.error
            : `App Host request failed (${response.status})`,
          {
            status: response.status,
            code:
              typeof error?.code === 'string'
                ? error.code
                : 'APP_HOST_REQUEST_FAILED',
          },
        );
      }
      if (response.status !== 200 && response.status !== 201) {
        throw new AppHostRequestError(
          `App Host returned an invalid upload status (${response.status})`,
        );
      }
      return {
        result: payload as AppReleaseUploadResult,
        status: response.status,
      };
    } catch (error) {
      if (error instanceof ReleaseManagementError) {
        throw error;
      }
      throw new AppHostRequestError(
        error instanceof Error ? error.message : String(error),
        { cause: error },
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  async controlLifecycle(
    appId: string,
    action: AppLifecycleAction,
  ): Promise<AppHostLifecycleResult> {
    const payload = await this.send<{ lifecycle: AppHostLifecycleResult }>(
      `/__apps/${encodeURIComponent(appId)}/${action}`,
      { method: 'POST', body: '{}' },
    );
    return payload.lifecycle;
  }

  private async send<T>(pathname: string, init: RequestInit = {}): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    timeout.unref?.();
    const headers = new Headers(init.headers);
    headers.set('accept', 'application/json');
    if (init.body !== undefined) {
      headers.set('content-type', 'application/json');
    }
    if (this.controlToken) {
      headers.set('authorization', `Bearer ${this.controlToken}`);
    }

    try {
      const response = await this.request(new URL(pathname, this.baseUrl), {
        ...init,
        headers,
        signal: controller.signal,
      });
      const payload = await readJson(response);
      if (!response.ok) {
        const error = asRecord(payload);
        throw new AppHostRequestError(
          typeof error?.error === 'string'
            ? error.error
            : `App Host request failed (${response.status})`,
          {
            status: response.status,
            code:
              typeof error?.code === 'string'
                ? error.code
                : 'APP_HOST_REQUEST_FAILED',
          },
        );
      }
      return payload as T;
    } catch (error) {
      if (error instanceof ReleaseManagementError) {
        throw error;
      }
      throw new AppHostRequestError(
        error instanceof Error ? error.message : String(error),
        { cause: error },
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private async readRuntimeResources(
    app: ActiveAppSummary,
  ): Promise<AppRuntimeResourceSummary[]> {
    if (!isSafeAppRuntimePath(app.id, app.basePath)) {
      return app.resources ?? [];
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    timeout.unref?.();
    const headers = new Headers({ accept: 'application/json' });

    try {
      const response = await this.request(
        new URL(`${app.basePath}/healthz`, this.baseUrl),
        { headers, signal: controller.signal },
      );
      const payload = asRecord(await readJson(response));
      return isRuntimeResourceArray(payload?.resources)
        ? payload.resources
        : (app.resources ?? []);
    } catch {
      return (app.resources ?? []).map((resource) => ({
        ...resource,
        status: 'error',
        updatedAt: new Date().toISOString(),
        error: {
          code: 'RUNTIME_RESOURCE_CHECK_FAILED',
          message: 'Runtime 资源状态检查失败。',
        },
      }));
    } finally {
      clearTimeout(timeout);
    }
  }
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new AppHostRequestError('App Host returned a non-JSON response');
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isSafeAppRuntimePath(appId: string, basePath: string): boolean {
  return (
    /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(appId) && basePath === `/${appId}`
  );
}

function isRuntimeResourceArray(
  value: unknown,
): value is AppRuntimeResourceSummary[] {
  return Array.isArray(value) && value.every(isRuntimeResource);
}

function isRuntimeResource(value: unknown): value is AppRuntimeResourceSummary {
  const resource = asRecord(value);
  return Boolean(
    resource &&
    typeof resource.id === 'string' &&
    typeof resource.kind === 'string' &&
    typeof resource.name === 'string' &&
    isRuntimeResourceStatus(resource.status) &&
    typeof resource.provider === 'string' &&
    typeof resource.updatedAt === 'string',
  );
}

function isRuntimeResourceStatus(
  value: unknown,
): value is AppRuntimeResourceStatus {
  return (
    value === 'applying' ||
    value === 'active' ||
    value === 'restart-required' ||
    value === 'error'
  );
}
