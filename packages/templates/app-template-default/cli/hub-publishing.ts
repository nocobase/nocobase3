import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat, readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { parseEnv } from 'node:util';

export interface PublishingOptions {
  hub?: string;
  'api-key'?: string;
  'app-id'?: string;
  file?: string;
  config?: string;
  'release-id'?: string;
  'idempotency-key'?: string;
  deploy?: boolean;
  wait?: boolean;
  timeout?: number;
}
export class PublishingError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly exitCode: number,
  ) {
    super(message);
  }
}

/** HTTP-only tooling. It never initializes the application or reads Hub storage. */
export async function publishToHub(
  operation: 'upload' | 'deploy',
  options: PublishingOptions,
  root: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<Record<string, unknown>> {
  // Parse locally so application configuration never mutates the CLI process environment.
  let fileEnv: NodeJS.ProcessEnv = {};
  try {
    fileEnv = parseEnv(await readFile(path.join(root, '.env'), 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
      throw new PublishingError(
        'INVALID_ENV_FILE',
        'Cannot read the App root .env file.',
        2,
      );
  }
  const hub = options.hub ?? env.HUB_URL ?? fileEnv.HUB_URL;
  const apiKey = options['api-key'] ?? env.HUB_API_KEY ?? fileEnv.HUB_API_KEY;
  const appId = options['app-id'] ?? env.HUB_APP_ID ?? fileEnv.HUB_APP_ID;
  if (!hub || !apiKey || !appId)
    throw new PublishingError(
      'MISSING_CONFIGURATION',
      'Provide --hub, --app-id and --api-key, or set HUB_URL, HUB_APP_ID and HUB_API_KEY in the environment or App root .env file.',
      2,
    );
  if (!/^[A-Za-z0-9_-]+$/.test(appId) || /[\r\n]/.test(apiKey))
    throw new PublishingError(
      'INVALID_CONFIGURATION',
      'Invalid App ID or API key.',
      2,
    );
  let base: URL;
  try {
    base = new URL(hub);
  } catch {
    throw new PublishingError(
      'INVALID_HUB_URL',
      'Hub URL must be an absolute HTTP(S) application URL.',
      2,
    );
  }
  if (
    !['http:', 'https:'].includes(base.protocol) ||
    base.username ||
    base.password ||
    base.search ||
    base.hash
  )
    throw new PublishingError(
      'INVALID_HUB_URL',
      'Hub URL must be HTTP(S), without credentials, query or fragment.',
      2,
    );
  const wait =
    options.wait ?? (operation === 'deploy' || options.deploy === true);
  const timeout = options.timeout ?? 600;
  if (!Number.isFinite(timeout) || timeout <= 0 || timeout > 86400)
    throw new PublishingError(
      'INVALID_TIMEOUT',
      'Timeout must be between 1 and 86400 seconds.',
      2,
    );
  if (operation === 'upload' && options.wait && !options.deploy)
    throw new PublishingError(
      'WAIT_REQUIRES_DEPLOY',
      'Use --deploy with --wait when uploading.',
      2,
    );
  if (
    options['idempotency-key'] !== undefined &&
    !/^[A-Za-z0-9._:-]{1,128}$/.test(options['idempotency-key'])
  )
    throw new PublishingError(
      'INVALID_IDEMPOTENCY_KEY',
      'Idempotency key must contain 1–128 letters, digits, dots, underscores, colons or hyphens.',
      2,
    );
  if (operation === 'upload' && options.config !== undefined && !options.deploy)
    throw new PublishingError(
      'CONFIG_REQUIRES_DEPLOY',
      'Use --deploy with --config when uploading.',
      2,
    );
  let config: { mode: 'file'; content: string } | undefined;
  if (options.config !== undefined) {
    try {
      if (!options.config.trim()) throw new Error('Empty path');
      const filename = path.resolve(root, options.config);
      const info = await stat(filename);
      if (!info.isFile() || info.size < 1 || info.size > 1024 * 1024)
        throw new Error('Invalid size');
      const content = new TextDecoder('utf-8', { fatal: true }).decode(
        await readFile(filename),
      );
      if (!content.trim() || Buffer.byteLength(content) > 1024 * 1024)
        throw new Error('Invalid content');
      config = { mode: 'file', content };
    } catch {
      throw new PublishingError(
        'INVALID_CONFIG_FILE',
        'Configuration must be a readable, non-empty UTF-8 file of at most 1 MiB.',
        2,
      );
    }
  }
  base.pathname = `${base.pathname.replace(/\/$/, '')}/api/hub/apps/${encodeURIComponent(appId)}/`;
  const signal = AbortSignal.timeout(timeout * 1000);
  const request = async (
    relative: string,
    init: RequestInit,
  ): Promise<Record<string, unknown>> => {
    let response: Response;
    try {
      response = await fetch(new URL(relative, base), {
        ...init,
        signal,
        redirect: 'error',
        headers: { ...init.headers, authorization: `Bearer ${apiKey}` },
      });
    } catch {
      throw new PublishingError(
        'RESULT_UNKNOWN',
        'Hub could not confirm the result. Retry with the same idempotency key.',
        3,
      );
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new PublishingError(
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
      throw new PublishingError(
        code,
        `Hub rejected the request (${response.status}, ${code}).`,
        1,
      );
    }
    if (!isRecord(payload) || !isRecord(payload.data))
      throw new PublishingError(
        'INVALID_HUB_RESPONSE',
        'Hub response is missing its result; the outcome is unknown. Check Hub before retrying with the same idempotency key.',
        3,
      );
    return payload.data;
  };
  let result: Record<string, unknown>;
  if (operation === 'upload') {
    const file = path.resolve(
      root,
      options.file ?? 'storage/exports/dist.tar.gz',
    );
    let size: number;
    let checksum: string;
    try {
      const info = await stat(file);
      if (!info.isFile() || info.size < 1 || info.size > 256 * 1024 * 1024)
        throw new Error('Invalid file');
      size = info.size;
      const hash = createHash('sha256');
      for await (const chunk of createReadStream(file)) hash.update(chunk);
      checksum = hash.digest('hex');
    } catch {
      throw new PublishingError(
        'INVALID_ARTIFACT',
        'Artifact must be a readable file between 1 byte and 256 MiB. Run pnpm build --tar first.',
        2,
      );
    }
    const requestKey = options['idempotency-key'] ?? checksum;
    const stream = createReadStream(file);
    // A bounded UTF-8 configuration prefix keeps the archive streaming and unchanged.
    const configBytes = config
      ? Buffer.from(config.content, 'utf8')
      : undefined;
    const body = configBytes
      ? Readable.from(
          (async function* () {
            yield configBytes;
            yield* stream;
          })(),
        )
      : stream;
    // Observe errors before fetch starts, including on an unconsumed config body.
    const streamsFinished = Promise.allSettled(
      [...new Set([stream, body])].map((uploadStream) =>
        finished(uploadStream, { cleanup: true }),
      ),
    );
    let data: Record<string, unknown>;
    try {
      const init: RequestInit & { duplex: 'half' } = {
        method: 'POST',
        duplex: 'half',
        body: body as unknown as RequestInit['body'],
        headers: {
          'content-type': configBytes
            ? 'application/vnd.nocobase.release-upload.v1'
            : 'application/gzip',
          'content-length': String(size + (configBytes?.byteLength ?? 0)),
          ...(configBytes
            ? { 'x-hub-config-length': String(configBytes.byteLength) }
            : {}),
          'x-artifact-sha256': checksum,
          'idempotency-key': requestKey,
          ...(options.deploy ? { 'x-hub-deployment-intent': 'explicit' } : {}),
          ...(wait ? { 'x-hub-wait': 'true' } : {}),
        },
      };
      data = await request('releases', init);
    } finally {
      body.destroy();
      stream.destroy();
      // destroy() can return before the pending file open and close complete.
      // Cleanup errors must not replace the classified Hub request result.
      await streamsFinished;
    }
    if (!isIdentifier(data.releaseId))
      throw new PublishingError(
        'INVALID_HUB_RESPONSE',
        'Hub did not return a Release ID.',
        3,
      );
    if (
      (options.deploy && data.operationId === undefined) ||
      (data.operationId != null && !isIdentifier(data.operationId))
    )
      throw new PublishingError(
        'INVALID_HUB_RESPONSE',
        'Hub returned an invalid deployment ID; the result is unknown.',
        3,
      );
    if (options.deploy && data.operationId == null)
      throw new PublishingError(
        'NO_DEPLOYMENT',
        'Hub did not confirm a deployment. Use app deploy --release-id to deploy an existing Release.',
        1,
      );
    result = {
      releaseId: data.releaseId,
      checksum,
      size,
      version: data.version,
      reused: data.reused === true,
      operationId: data.operationId ?? null,
      idempotencyKey: requestKey,
    };
  } else {
    if (!options['release-id'])
      throw new PublishingError('MISSING_RELEASE', 'Provide --release-id.', 2);
    const requestKey =
      options['idempotency-key'] ??
      createHash('sha256')
        .update(
          `${appId}:${options['release-id']}${config ? ':' + createHash('sha256').update(config.content).digest('hex') : ''}`,
        )
        .digest('hex');
    const data = await request('deploy', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': requestKey,
      },
      body: JSON.stringify({
        releaseId: options['release-id'],
        ...(config ? { config } : {}),
      }),
    });
    if (!isIdentifier(data.operationId))
      throw new PublishingError(
        'INVALID_HUB_RESPONSE',
        'Hub did not return a deployment ID.',
        3,
      );
    requireDeploymentStatus(data.status);
    if (data.status === 'failed' || data.status === 'cancelled')
      throw new PublishingError(
        'DEPLOYMENT_FAILED',
        `Deployment ${data.operationId} ${data.status}. Use a new idempotency key to retry deployment.`,
        1,
      );
    result = {
      releaseId: options['release-id'],
      operationId: data.operationId,
      operationStatus: data.status,
      idempotencyKey: requestKey,
      ...(data.reused === true ? { reused: true } : {}),
      ...(typeof data.createdAt === 'string' && data.createdAt
        ? { deploymentCreatedAt: data.createdAt }
        : {}),
    };
  }
  // Reusing an operation confirms its identity, not that it can still succeed.
  const checkUploadRetry =
    operation === 'upload' && options.deploy && result.reused === true;
  if (wait || checkUploadRetry) {
    if (typeof result.operationId !== 'string')
      throw new PublishingError(
        'NO_DEPLOYMENT',
        'Release already exists without a deployment. Use app deploy --release-id to deploy it.',
        1,
      );
    while (true) {
      const state = await request(
        `deployments/${encodeURIComponent(result.operationId)}/status`,
        { method: 'GET' },
      );
      requireDeploymentStatus(state.status);
      result.operationStatus = state.status;
      if (state.status === 'succeeded') break;
      if (state.status === 'failed' || state.status === 'cancelled')
        throw new PublishingError(
          'DEPLOYMENT_FAILED',
          `Deployment ${result.operationId} ${String(state.status)}. Inspect it in Hub.`,
          1,
        );
      if (!wait) break;
      try {
        await delay(1000, undefined, { signal });
      } catch {
        throw new PublishingError(
          'WAIT_TIMEOUT',
          'Timed out waiting for deployment. The deployment may still complete.',
          3,
        );
      }
    }
  }
  // A reused operation is history: this command did not deploy anything now, and the App may be
  // running another Release. Reusing a retry identity is deliberate, so this warns rather than fails.
  if (
    result.reused === true &&
    (operation === 'deploy' || options.deploy === true)
  )
    result.warning =
      operation === 'deploy'
        ? 'Hub reused an earlier deployment for this Release and configuration; nothing was deployed now. Pass a new --idempotency-key to deploy again.'
        : 'Hub reused an existing Release and its deployment; nothing was deployed now. Pass a new --idempotency-key to publish again.';
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isIdentifier(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]+$/.test(value);
}

function requireDeploymentStatus(status: unknown): void {
  if (
    status !== 'queued' &&
    status !== 'deploying' &&
    status !== 'succeeded' &&
    status !== 'failed' &&
    status !== 'cancelled'
  )
    throw new PublishingError(
      'RESULT_UNKNOWN',
      'Deployment result cannot be confirmed. Check the deployment in Hub before retrying with the same idempotency key.',
      3,
    );
}
