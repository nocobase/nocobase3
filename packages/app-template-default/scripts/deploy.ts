import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import * as clack from '@clack/prompts';

import {
  assertSafePathSegment,
  createAppReleaseArchive,
  normalizeHubUrl,
  prepareAppRelease,
  readAppPackageManifest,
  type PreparedAppRelease,
} from './deploy-release.js';

const RELEASE_CONTENT_TYPE = 'application/vnd.nocobase.release+tar+gzip';
const APP_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;
const appDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

interface DeploymentApproval {
  id: string;
  status: string;
}

interface DeployResult {
  appId: string;
  releaseId: string;
  version: string;
  artifactSha256: string;
  upload: 'uploaded' | 'unchanged' | 'dry-run';
  approvalId: string | null;
  approvalStatus: string | null;
  deliveriesUrl: string;
  dryRun: boolean;
}

interface DeployFlags {
  hub?: string;
  token?: string;
  releaseId?: string;
  noBuild: boolean;
  dryRun: boolean;
  json: boolean;
  help: boolean;
}

interface TextOutput {
  write(value: string): unknown;
}

export interface DeployBuildContext {
  appDirectory: string;
  env: NodeJS.ProcessEnv;
  stdout: TextOutput;
  stderr: TextOutput;
}

export interface RunDeployCommandOptions {
  appDirectory: string;
  argv: string[];
  env?: NodeJS.ProcessEnv;
  fetch?: typeof globalThis.fetch;
  interactive?: boolean;
  promptToken?: () => Promise<string>;
  runBuild?: (context: DeployBuildContext) => Promise<void>;
  stdout?: TextOutput;
  stderr?: TextOutput;
}

export async function runDeployCommand(
  options: RunDeployCommandOptions,
): Promise<number> {
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  let flags: DeployFlags;

  try {
    flags = parseDeployFlags(options.argv);
  } catch (error) {
    writeError(stderr, error);
    return 2;
  }

  if (flags.help) {
    stdout.write(`${DEPLOY_HELP}\n`);
    return 0;
  }

  if (!flags.hub) {
    stderr.write(
      [
        'A target Hub is required. Pass --hub <url>.',
        'Example: pnpm run deploy --hub http://127.0.0.1:13001/hub',
      ].join('\n') + '\n',
    );
    return 2;
  }

  try {
    const hub = normalizeHubUrl(flags.hub);
    const packageManifest = await readAppPackageManifest(options.appDirectory);
    const appId = packageManifest.name?.trim();
    if (!appId) {
      throw new Error(
        'package.json must contain a non-empty name to use as the App ID.',
      );
    }
    assertSupportedAppId(appId);
    if (flags.releaseId) {
      assertSafePathSegment(flags.releaseId, 'Release ID');
    }

    if (!flags.noBuild) {
      if (!packageManifest.scripts?.build) {
        throw new Error(
          `"${appId}" has no build script in package.json. Add one, or pass --no-build to use an existing dist directory.`,
        );
      }
      const buildEnvironment = { ...(options.env ?? process.env) };
      delete buildEnvironment.NB3_HUB_TOKEN;
      if (!flags.json) stdout.write(`Building ${appId} with pnpm...\n`);
      await (options.runBuild ?? runAppBuild)({
        appDirectory: options.appDirectory,
        env: buildEnvironment,
        stdout: flags.json ? stderr : stdout,
        stderr,
      });
    }

    const release = await prepareAppRelease({
      appId,
      appDirectory: options.appDirectory,
      releaseId: flags.releaseId,
      packageManifest,
    });
    const deliveriesUrl = `${hub}/deliveries`;

    if (flags.dryRun) {
      printResult(
        {
          appId: release.appId,
          releaseId: release.releaseId,
          version: release.version,
          artifactSha256: release.artifactSha256,
          upload: 'dry-run',
          approvalId: null,
          approvalStatus: null,
          deliveriesUrl,
          dryRun: true,
        },
        flags.json,
        stdout,
      );
      return 0;
    }

    const token = await resolveDeployToken(flags, {
      env: options.env ?? process.env,
      interactive:
        !flags.json && (options.interactive ?? Boolean(process.stdin.isTTY)),
      promptToken: options.promptToken ?? promptDeploymentToken,
    });
    const fetch = options.fetch ?? globalThis.fetch;
    const upload = await uploadRelease(hub, token, release, fetch);
    const approval = await requestApproval(hub, token, release, fetch);

    printResult(
      {
        appId: release.appId,
        releaseId: release.releaseId,
        version: release.version,
        artifactSha256: release.artifactSha256,
        upload,
        approvalId: approval.id,
        approvalStatus: approval.status,
        deliveriesUrl,
        dryRun: false,
      },
      flags.json,
      stdout,
    );
    return 0;
  } catch (error) {
    writeError(stderr, error);
    return 1;
  }
}

function parseDeployFlags(argv: string[]): DeployFlags {
  const flags: DeployFlags = {
    noBuild: false,
    dryRun: false,
    json: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    switch (argument) {
      case '-h':
      case '--help':
        flags.help = true;
        break;
      case '--hub':
        flags.hub = requireFlagValue(argv, ++index, '--hub');
        break;
      case '--token':
        flags.token = requireFlagValue(argv, ++index, '--token');
        break;
      case '--release-id':
        flags.releaseId = requireFlagValue(argv, ++index, '--release-id');
        break;
      case '--no-build':
        flags.noBuild = true;
        break;
      case '--dry-run':
        flags.dryRun = true;
        break;
      case '--json':
        flags.json = true;
        break;
      default:
        throw new Error(
          `Unknown option "${argument}". Run pnpm run deploy --help for usage.`,
        );
    }
  }

  return flags;
}

function requireFlagValue(argv: string[], index: number, flag: string): string {
  const rawValue = argv[index];
  if (rawValue === undefined) {
    throw new Error(`${flag} requires a value.`);
  }
  const value = rawValue.trim();
  if (!value || value.startsWith('--')) {
    throw new Error(`${flag} requires a value.`);
  }
  return value;
}

async function resolveDeployToken(
  flags: DeployFlags,
  options: {
    env: NodeJS.ProcessEnv;
    interactive: boolean;
    promptToken: () => Promise<string>;
  },
): Promise<string> {
  const supplied = (flags.token ?? options.env.NB3_HUB_TOKEN)?.trim();
  if (supplied) return supplied;
  if (!options.interactive) {
    throw new Error(
      'No deployment token was provided. Pass --token, or set NB3_HUB_TOKEN.',
    );
  }

  const prompted = (await options.promptToken()).trim();
  if (!prompted) throw new Error('A deployment token is required.');
  return prompted;
}

async function promptDeploymentToken(): Promise<string> {
  const token = await clack.password({
    message: 'Deployment token',
    validate: (value) =>
      value?.trim() ? undefined : 'A deployment token is required.',
  });
  if (clack.isCancel(token)) throw new Error('Deployment cancelled.');
  return token;
}

async function runAppBuild(context: DeployBuildContext): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn('pnpm', ['run', 'build'], {
      cwd: context.appDirectory,
      env: context.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (chunk: Buffer) => {
      context.stdout.write(chunk.toString('utf8'));
    });
    child.stderr.on('data', (chunk: Buffer) => {
      context.stderr.write(chunk.toString('utf8'));
    });
    child.once('error', reject);
    child.once('close', (code, signal) => {
      if (code === 0) resolve();
      else {
        reject(
          new Error(
            `App build failed${code === null ? ` with signal ${signal ?? 'unknown'}` : ` with exit code ${code}`}.`,
          ),
        );
      }
    });
  });
}

async function uploadRelease(
  hub: string,
  token: string,
  release: PreparedAppRelease,
  fetch: typeof globalThis.fetch,
): Promise<'uploaded' | 'unchanged'> {
  const endpoint = `${hub}/api/apps/${encodeURIComponent(release.appId)}/releases/${encodeURIComponent(release.releaseId)}`;
  const response = await fetchHub(
    fetch,
    endpoint,
    {
      method: 'PUT',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': RELEASE_CONTENT_TYPE,
      },
      body: Readable.toWeb(createAppReleaseArchive(release)),
      redirect: 'manual',
      duplex: 'half',
    },
    'Release upload',
    token,
  );

  if (response.status !== 200 && response.status !== 201) {
    throw await hubResponseError('Release upload', response, token);
  }
  return response.status === 201 ? 'uploaded' : 'unchanged';
}

async function requestApproval(
  hub: string,
  token: string,
  release: PreparedAppRelease,
  fetch: typeof globalThis.fetch,
): Promise<DeploymentApproval> {
  const endpoint = `${hub}/api/release-management/apps/${encodeURIComponent(release.appId)}/deployments`;
  const response = await fetchHub(
    fetch,
    endpoint,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'idempotency-key': deploymentIdempotencyKey(release),
      },
      body: JSON.stringify({ releaseId: release.releaseId }),
      redirect: 'manual',
    },
    'Approval request',
    token,
  );

  if (!response.ok) {
    throw await hubResponseError('Approval request', response, token);
  }
  const data = await readJsonResponse(response, 'Approval request');
  const approval = isRecord(data) ? data.approval : undefined;
  if (!isRecord(approval) || typeof approval.id !== 'string') {
    throw new Error('Approval request returned no approval ID.');
  }
  return {
    id: approval.id,
    status: typeof approval.status === 'string' ? approval.status : 'pending',
  };
}

async function fetchHub(
  fetch: typeof globalThis.fetch,
  endpoint: string,
  init: RequestInit & { duplex?: 'half' },
  operation: string,
  token: string,
): Promise<Response> {
  try {
    return await fetch(endpoint, init);
  } catch (error) {
    if (error instanceof Error) {
      redactErrorInPlace(error, token);
      throw new Error(
        `${operation} could not reach the Hub: ${error.message}`,
        { cause: error },
      );
    }
    throwHubConnectionError(operation, redactSecret(String(error), token));
  }
}

function redactErrorInPlace(error: Error, secret: string): void {
  error.message = redactSecret(error.message, secret);
  if (error.stack) error.stack = redactSecret(error.stack, secret);
  if (error.cause instanceof Error) {
    redactErrorInPlace(error.cause, secret);
  } else if (error.cause !== undefined) {
    error.cause = new Error(redactSecret(String(error.cause), secret));
  }
}

function throwHubConnectionError(operation: string, failure: string): never {
  throw new Error(`${operation} could not reach the Hub: ${failure}`);
}

function printResult(
  result: DeployResult,
  json: boolean,
  stdout: TextOutput,
): void {
  if (json) {
    stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }

  if (result.dryRun) {
    stdout.write(
      `Dry run complete for ${result.appId}/${result.releaseId} (${result.artifactSha256}).\n`,
    );
    stdout.write('No network requests were made.\n');
    return;
  }

  stdout.write(`Release ${result.releaseId} ${result.upload}.\n`);
  stdout.write(
    `Submitted for administrator approval: ${result.approvalId} (${result.approvalStatus}).\n`,
  );
  stdout.write(`Next: review and approve it at ${result.deliveriesUrl}\n`);
}

function assertSupportedAppId(value: string): void {
  if (!APP_ID.test(value)) {
    throw new Error(
      'App ID must start with a letter or number and contain only letters, numbers, underscores, and hyphens.',
    );
  }
}

function deploymentIdempotencyKey(release: PreparedAppRelease): string {
  const digest = createHash('sha256')
    .update('nb3-deploy\0')
    .update(release.appId)
    .update('\0')
    .update(release.releaseId)
    .update('\0')
    .update(release.artifactSha256)
    .digest('hex')
    .slice(0, 32);
  return `nb3-deploy-${digest}`;
}

async function hubResponseError(
  operation: string,
  response: Response,
  token: string,
): Promise<Error> {
  const body = await readResponseBody(response);
  const code = isRecord(body) && typeof body.code === 'string' ? body.code : '';
  const detail =
    isRecord(body) && typeof body.error === 'string'
      ? body.error
      : typeof body === 'string'
        ? body
        : '';
  const context = redactSecret(
    [code, detail].filter(Boolean).join(': '),
    token,
  );
  return new Error(
    `${operation} failed with HTTP ${response.status}${context ? ` (${context})` : ''}.`,
  );
}

function redactSecret(value: string, secret: string): string {
  return secret ? value.replaceAll(secret, '[REDACTED]') : value;
}

async function readJsonResponse(
  response: Response,
  operation: string,
): Promise<unknown> {
  const value = await readResponseBody(response);
  if (typeof value === 'string') {
    throw new Error(`${operation} returned invalid JSON.`);
  }
  return value;
}

async function readResponseBody(response: Response): Promise<unknown> {
  const content = await response.text();
  if (!content) return undefined;
  try {
    return JSON.parse(content) as unknown;
  } catch {
    return content.slice(0, 500);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function writeError(output: TextOutput, error: unknown): void {
  output.write(`${error instanceof Error ? error.message : String(error)}\n`);
}

export const DEPLOY_HELP = `Build and deploy this App to a Hub.

Usage:
  pnpm run deploy --hub <url> [options]

Options:
  --hub <url>          Target Hub URL, including its mount path (required)
  --token <token>      Deployment token; defaults to NB3_HUB_TOKEN
  --release-id <id>    Immutable Release ID; defaults to version + artifact hash
  --no-build           Upload the existing dist directory without building
  --dry-run            Build and validate without contacting the Hub
  --json               Print one machine-readable JSON object
  -h, --help           Show this help

Examples:
  pnpm run deploy --hub http://127.0.0.1:13001/hub
  NB3_HUB_TOKEN=secret pnpm run deploy --hub https://hub.example.com/hub
  pnpm run deploy --hub https://hub.example.com/hub --dry-run --json
  pnpm run deploy --hub https://hub.example.com/hub --no-build`;

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  process.exitCode = await runDeployCommand({
    appDirectory,
    argv: process.argv.slice(2),
  });
}
