import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { Command, Flags } from '@oclif/core';
import { requireAppProject } from '../../lib/app-project.ts';
import {
  assertSafePathSegment,
  createAppReleaseArchive,
  normalizeHubUrl,
  prepareAppRelease,
  readAppPackageManifest,
  type PreparedAppRelease,
} from '../../lib/app-release.ts';
import { detectPackageManager } from '../../lib/package-manager.ts';
import {
  CommandFailedError,
  runAttached,
  runCommand,
} from '../../lib/run-command.ts';

const RELEASE_CONTENT_TYPE = 'application/vnd.nocobase.release+tar+gzip';

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

export default class AppDeploy extends Command {
  static override summary = 'Deploy the app to a hub.';
  static override description =
    'Builds a deterministic Release, uploads it to the target Hub, and submits it for administrator approval. It does not bypass the approval gate.';

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --hub http://127.0.0.1:13001/hub',
    '<%= config.bin %> <%= command.id %> --no-build --dry-run --json',
  ];

  static override flags = {
    dir: Flags.string({
      description: 'App directory. Defaults to the current directory.',
    }),
    hub: Flags.string({
      description: 'Target hub URL. Defaults to the hub recorded in .nb3/.',
    }),
    token: Flags.string({
      description:
        'App deployment token. Defaults to the NB3_HUB_TOKEN environment variable.',
    }),
    'release-id': Flags.string({
      description:
        'Immutable Release ID. Defaults to <package-version>-<artifact-hash-prefix>.',
    }),
    'no-build': Flags.boolean({
      default: false,
      description: 'Upload the existing dist directory without running build.',
    }),
    'dry-run': Flags.boolean({
      default: false,
      description: 'Build and validate the Release without contacting the Hub.',
    }),
    json: Flags.boolean({
      default: false,
      description: 'Print a single machine-readable JSON result.',
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(AppDeploy);

    const project = await requireAppProject(flags.dir);
    const configuredHub = flags.hub ?? project.config.hub;

    if (!configuredHub) {
      this.error(
        [
          'No hub to deploy to.',
          `Pass --hub, or record one with \`${this.config.bin} app config hub <url>\`.`,
        ].join('\n'),
      );
    }

    const hub = normalizeHubUrl(configuredHub);
    const packageManifest = await readAppPackageManifest(project.directory);
    assertSupportedAppId(project.config.name);
    if (flags['release-id']) {
      assertSafePathSegment(flags['release-id'], 'Release ID');
    }

    if (!flags['no-build']) {
      if (!packageManifest.scripts?.build) {
        this.error(
          `"${project.config.name}" has no build script in its package.json. Add one, or pass --no-build to use an existing dist directory.`,
        );
      }
      const packageManager = await detectPackageManager(
        project.directory,
        packageManifest.packageManager,
      );
      const buildEnvironment = { ...process.env };
      delete buildEnvironment.NB3_HUB_TOKEN;
      if (!flags.json) {
        this.log(`Building ${project.config.name} with ${packageManager}...`);
      }
      if (flags.json) {
        try {
          await runCommand(packageManager, ['run', 'build'], {
            cwd: project.directory,
            env: buildEnvironment,
          });
        } catch (error) {
          if (error instanceof CommandFailedError) {
            this.error(
              `App build failed${error.exitCode === null ? '' : ` with exit code ${error.exitCode}`}${error.stderr ? `: ${error.stderr}` : '.'}`,
            );
          }
          throw error;
        }
      } else {
        const exitCode = await runAttached(packageManager, ['run', 'build'], {
          cwd: project.directory,
          env: buildEnvironment,
        });
        if (exitCode !== 0) {
          this.error(`App build failed with exit code ${exitCode}.`);
        }
      }
    }

    const release = await prepareAppRelease({
      appId: project.config.name,
      appDirectory: project.directory,
      releaseId: flags['release-id'],
      packageManifest,
    });
    const deliveriesUrl = `${hub}/deliveries`;

    if (flags['dry-run']) {
      const result: DeployResult = {
        appId: release.appId,
        releaseId: release.releaseId,
        version: release.version,
        artifactSha256: release.artifactSha256,
        upload: 'dry-run',
        approvalId: null,
        approvalStatus: null,
        deliveriesUrl,
        dryRun: true,
      };
      this.printResult(result, flags.json);
      return;
    }

    const token = (flags.token ?? process.env.NB3_HUB_TOKEN)?.trim();
    if (!token) {
      this.error(
        'No deployment token was provided. Pass --token, or set NB3_HUB_TOKEN.',
      );
    }

    const upload = await this.uploadRelease(hub, token, release);
    const approval = await this.requestApproval(hub, token, release);
    const result: DeployResult = {
      appId: release.appId,
      releaseId: release.releaseId,
      version: release.version,
      artifactSha256: release.artifactSha256,
      upload,
      approvalId: approval.id,
      approvalStatus: approval.status,
      deliveriesUrl,
      dryRun: false,
    };
    this.printResult(result, flags.json);
  }

  private async uploadRelease(
    hub: string,
    token: string,
    release: PreparedAppRelease,
  ): Promise<'uploaded' | 'unchanged'> {
    const endpoint = `${hub}/api/apps/${encodeURIComponent(release.appId)}/releases/${encodeURIComponent(release.releaseId)}`;
    const response = await this.fetchHub(
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

  private async requestApproval(
    hub: string,
    token: string,
    release: PreparedAppRelease,
  ): Promise<DeploymentApproval> {
    const endpoint = `${hub}/api/release-management/apps/${encodeURIComponent(release.appId)}/deployments`;
    const response = await this.fetchHub(
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

  private async fetchHub(
    endpoint: string,
    init: RequestInit & { duplex?: 'half' },
    operation: string,
    token: string,
  ): Promise<Response> {
    let response: Response | undefined;
    let failure: string | undefined;
    try {
      response = await fetch(endpoint, init);
    } catch (error) {
      failure = redactSecret(
        error instanceof Error ? error.message : String(error),
        token,
      );
    }

    if (!response) {
      throw new Error(`${operation} could not reach the Hub: ${failure}`, {
        cause: new Error(failure),
      });
    }
    return response;
  }

  private printResult(result: DeployResult, json: boolean): void {
    if (json) {
      this.logJson(result);
      return;
    }

    if (result.dryRun) {
      this.log(
        `Dry run complete for ${result.appId}/${result.releaseId} (${result.artifactSha256}).`,
      );
      this.log('No network requests were made.');
      return;
    }

    this.log(`Release ${result.releaseId} ${result.upload}.`);
    this.log(
      `Submitted for administrator approval: ${result.approvalId} (${result.approvalStatus}).`,
    );
    this.log(`Next: review and approve it at ${result.deliveriesUrl}`);
  }
}

function assertSupportedAppId(value: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(value)) {
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
  if (!content) {
    return undefined;
  }
  try {
    return JSON.parse(content) as unknown;
  } catch {
    return content.slice(0, 500);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
