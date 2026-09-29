// The Hub's HTTP API, as hub-cli uses it. Every call is scoped to one App: `<Hub URL>/api/hub/apps/<App ID>/…`, with the
// API key as a bearer token.
import { createReadStream } from 'node:fs';
import { finished } from 'node:stream/promises';

import {
  HubCliError,
  type DeploymentStatus,
  type HubCliErrorDetails,
} from './errors.ts';
import { isRecord, type RemoteTarget } from './remotes.ts';

/** The platform an archive is built for, in the shape `pnpm build` records as `nocobase.buildTarget`. */
export interface BuildTarget {
  readonly platform: string;
  readonly arch: string;
  readonly libc: 'glibc' | 'musl' | null;
  readonly nodeAbi: number;
  readonly nodeMajor: number;
}

export interface AppInfo {
  /** What the Hub's Host runs Apps on; `null` when the Hub could not tell. */
  readonly buildTarget: BuildTarget | null;
}

export interface UploadedRelease {
  readonly releaseId: string;
  readonly version: string | undefined;
  /** The Hub already had this archive and answered with its Release. */
  readonly reused: boolean;
}

export interface StartedDeployment {
  readonly operationId: string;
  readonly status: DeploymentStatus;
  /** The Hub answered with an earlier deployment for the same idempotency key. */
  readonly reused: boolean;
  readonly createdAt: string | undefined;
}

export interface HubClientOptions {
  readonly target: RemoteTarget;
  readonly apiKey: string;
  /** Deadline for everything the client does, in seconds. */
  readonly timeout: number;
}

export class HubClient {
  /** What the run has established so far. Every failure carries it. */
  readonly known: HubCliErrorDetails = {};
  readonly signal: AbortSignal;
  /** `<Hub URL>/api/hub/apps/<App ID>`, without a trailing slash: the Hub routes the App itself there. */
  readonly #base: string;
  readonly #apiKey: string;

  constructor(options: HubClientOptions) {
    this.#apiKey = options.apiKey;
    this.signal = AbortSignal.timeout(options.timeout * 1000);
    this.#base = `${options.target.hub}/api/hub/apps/${encodeURIComponent(options.target.appId)}`;
  }

  failure(code: string, message: string, exitCode: number): HubCliError {
    return new HubCliError(
      code,
      message,
      exitCode,
      Object.keys(this.known).length > 0 ? { ...this.known } : undefined,
    );
  }

  async getApp(): Promise<AppInfo> {
    const data = await this.#request('', { method: 'GET' }, false);
    return { buildTarget: parseBuildTarget(data.buildTarget) };
  }

  async uploadRelease(input: {
    file: string;
    size: number;
    checksum: string;
    idempotencyKey: string;
  }): Promise<UploadedRelease> {
    const stream = createReadStream(input.file);
    // Observed before fetch starts, so an error on a stream fetch never read is still handled.
    const streamFinished = finished(stream, { cleanup: true }).catch(
      () => undefined,
    );
    let data: Record<string, unknown>;
    try {
      const init: RequestInit & { duplex: 'half' } = {
        method: 'POST',
        duplex: 'half',
        body: stream,
        headers: {
          'content-type': 'application/gzip',
          'content-length': String(input.size),
          'x-artifact-sha256': input.checksum,
          'idempotency-key': input.idempotencyKey,
        },
      };
      data = await this.#request('releases', init, true);
    } finally {
      stream.destroy();
      // destroy() can return before the pending file open and close complete.
      await streamFinished;
    }
    const releaseId = data.releaseId;
    if (!isIdentifier(releaseId))
      throw this.failure(
        'INVALID_HUB_RESPONSE',
        'Hub did not return a Release ID.',
        3,
      );
    return {
      releaseId,
      version: typeof data.version === 'string' ? data.version : undefined,
      reused: data.reused === true,
    };
  }

  async deploy(input: {
    releaseId: string;
    config: string | undefined;
    idempotencyKey: string;
  }): Promise<StartedDeployment> {
    const data = await this.#request(
      'deploy',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': input.idempotencyKey,
        },
        body: JSON.stringify({
          releaseId: input.releaseId,
          ...(input.config === undefined
            ? {}
            : { config: { mode: 'file', content: input.config } }),
        }),
      },
      true,
    );
    const operationId = data.operationId;
    if (!isIdentifier(operationId))
      throw this.failure(
        'INVALID_HUB_RESPONSE',
        'Hub did not return a deployment ID.',
        3,
      );
    const status = data.status;
    if (!isDeploymentStatus(status))
      throw this.failure('RESULT_UNKNOWN', UNCONFIRMED_DEPLOYMENT, 3);
    return {
      operationId,
      status,
      reused: data.reused === true,
      createdAt:
        typeof data.createdAt === 'string' && data.createdAt
          ? data.createdAt
          : undefined,
    };
  }

  async deploymentStatus(operationId: string): Promise<DeploymentStatus> {
    const data = await this.#request(
      `deployments/${encodeURIComponent(operationId)}/status`,
      { method: 'GET' },
      true,
    );
    if (!isDeploymentStatus(data.status))
      throw this.failure('RESULT_UNKNOWN', UNCONFIRMED_DEPLOYMENT, 3);
    return data.status;
  }

  /**
   * `changes` says whether the request changes something on the Hub. A connection failure on one that does leaves its
   * outcome unknown; on a read it only means the Hub was not reached.
   */
  async #request(
    relative: string,
    init: RequestInit,
    changes: boolean,
  ): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await fetch(
        relative ? `${this.#base}/${relative}` : this.#base,
        {
          ...init,
          signal: this.signal,
          redirect: 'error',
          headers: { ...init.headers, authorization: `Bearer ${this.#apiKey}` },
        },
      );
    } catch {
      throw changes
        ? this.failure(
            'RESULT_UNKNOWN',
            'Hub could not confirm the result. Retry with the same idempotency key.',
            3,
          )
        : this.failure(
            'HUB_UNREACHABLE',
            'Hub could not be reached. Check the remote URL and the network.',
            1,
          );
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw this.failure(
        'INVALID_HUB_RESPONSE',
        'Hub returned an unreadable response; the result is unknown.',
        3,
      );
    }
    if (!response.ok) {
      const error =
        isRecord(payload) && isRecord(payload.error)
          ? payload.error
          : undefined;
      const code =
        typeof error?.code === 'string' && /^[A-Z0-9_]+$/.test(error.code)
          ? error.code
          : 'HUB_REQUEST_FAILED';
      // Do not echo raw response text: proxies and remote exceptions can contain credentials.
      throw this.failure(
        code,
        `Hub rejected the request (${response.status}, ${code}).`,
        1,
      );
    }
    if (!isRecord(payload) || !isRecord(payload.data))
      throw this.failure(
        'INVALID_HUB_RESPONSE',
        'Hub response is missing its result; the outcome is unknown. Check Hub before retrying with the same idempotency key.',
        3,
      );
    return payload.data;
  }
}

const UNCONFIRMED_DEPLOYMENT =
  'Deployment result cannot be confirmed. Check the deployment in Hub before retrying with the same idempotency key.';

export function parseBuildTarget(value: unknown): BuildTarget | null {
  if (
    !isRecord(value) ||
    typeof value.platform !== 'string' ||
    typeof value.arch !== 'string' ||
    typeof value.nodeMajor !== 'number'
  )
    return null;
  return {
    platform: value.platform,
    arch: value.arch,
    libc: value.libc === 'musl' || value.libc === 'glibc' ? value.libc : null,
    nodeAbi: typeof value.nodeAbi === 'number' ? value.nodeAbi : 0,
    nodeMajor: value.nodeMajor,
  };
}

function isIdentifier(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]+$/.test(value);
}

export function isDeploymentStatus(
  status: unknown,
): status is DeploymentStatus {
  return (
    status === 'queued' ||
    status === 'deploying' ||
    status === 'succeeded' ||
    status === 'failed' ||
    status === 'cancelled'
  );
}
