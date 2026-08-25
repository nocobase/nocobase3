import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Command, Flags } from '@oclif/core';

import { requireAppProject } from '../../lib/app-project.ts';
import { HubCredentialManager } from '../../lib/hub-auth.ts';
import { AppBuildError, failHubCommand } from '../../lib/hub-command.ts';
import {
  HubApiError,
  normalizeHubUrl,
  type ReleaseUpload,
} from '../../lib/hub-client.ts';
import {
  assertGitWorktreeClean,
  pushHubRepository,
  readGitHead,
} from '../../lib/git.ts';
import { detectPackageManager } from '../../lib/package-manager.ts';
import {
  cacheOperationArtifact,
  createOperation,
  loadOperation,
  updateOperation,
  verifyCachedOperationArtifact,
} from '../../lib/operation-store.ts';
import {
  buildReleaseArtifact,
  type BuiltReleaseArtifact,
  type ReleaseManifest,
} from '../../lib/release-artifact.ts';
import { resolveReleaseVersion } from '../../lib/release-version.ts';
import { runCommand } from '../../lib/run-command.ts';
import { formatShellCommand } from '../../lib/shell.ts';
import { listAllReleases, waitForDeployment } from '../../lib/hub-workflow.ts';

export default class AppPublish extends Command {
  static override summary = 'Publish the current app source as a Release.';
  static override description =
    'Pushes a clean source commit, builds a deterministic Hub Release artifact, uploads it, and optionally deploys the verified Release.';

  static override examples = [
    '<%= config.bin %> <%= command.id %> --version 1.4.0 --non-interactive',
    '<%= config.bin %> <%= command.id %> --bump patch --deploy --json',
  ];

  static override flags = {
    dir: Flags.string({
      description: 'App directory. Defaults to the current directory.',
    }),
    hub: Flags.string({
      description: 'Public Hub root URL. Defaults to the app configuration.',
    }),
    version: Flags.string({
      description: 'Exact semantic version to publish.',
    }),
    bump: Flags.string({
      description: 'Bump the latest semantic version.',
      options: ['patch', 'minor', 'major'],
    }),
    deploy: Flags.boolean({
      default: false,
      description: 'Deploy the verified Release after publishing it.',
    }),
    'non-interactive': Flags.boolean({
      default: false,
      description: 'Never prompt for missing input.',
    }),
    'dry-run': Flags.boolean({
      default: false,
      description: 'Validate the publish plan without pushing or uploading.',
    }),
    json: Flags.boolean({
      default: false,
      description: 'Print one JSON result to stdout.',
    }),
    'operation-id': Flags.string({
      description: 'Resume or replay this publish operation.',
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(AppPublish);
    const operationId = flags['operation-id'] ?? randomUUID();
    let hub: string | undefined = flags.hub;
    let projectDirectory: string | undefined = flags.dir;
    let suggestedVersion: string | undefined;
    try {
      const project = await requireAppProject(flags.dir);
      projectDirectory = project.directory;
      const normalizedHub = normalizeHubUrl(hub ?? project.config.hub ?? '');
      hub = normalizedHub;
      const applicationSlug = project.config.slug ?? project.config.name;
      const operation = await createOperation({
        kind: 'app-publish',
        operationId,
        hubUrl: normalizedHub,
        idempotencyKey: operationId,
        parameters: {
          bump: flags.bump ?? 'none',
          deploy: String(flags.deploy),
          dryRun: String(flags['dry-run']),
          version: flags.version ?? 'none',
        },
        step: 'initialized',
      });
      const requiredScopes = [
        'apps:read',
        'source:read',
        'source:write',
        'releases:publish',
        ...(flags.bump ? (['releases:read'] as const) : []),
        ...(flags.deploy
          ? (['deployments:deploy', 'deployments:read'] as const)
          : []),
      ] as const;
      const result = await new HubCredentialManager(normalizedHub).authorized(
        requiredScopes,
        async (client, credential) => {
          const application = await client.getApplication(
            project.config.applicationId ?? applicationSlug,
          );
          if (
            operation.resourceIds?.applicationId &&
            operation.resourceIds.applicationId !== application.id
          ) {
            throw new Error(
              `Operation ${operationId} belongs to application ${operation.resourceIds.applicationId}, not ${application.id}. Use a new operation ID.`,
            );
          }
          const repository = await client.getRepository(application.id);
          const releases =
            operation.release || flags.version || !flags.bump
              ? []
              : await listAllReleases(client, application.id);
          if (
            operation.release &&
            flags.version &&
            flags.version !== operation.release.version
          ) {
            throw new Error(
              `Operation ${operationId} already publishes version ${operation.release.version}; use a new operation ID to publish ${flags.version}.`,
            );
          }
          const version =
            operation.release?.version ??
            resolveReleaseVersion({
              version: flags.version,
              bump: flags.bump as 'patch' | 'minor' | 'major' | undefined,
              releases,
            });
          if (flags['dry-run']) {
            return {
              application,
              dryRun: true as const,
              repository,
              version,
            };
          }

          const recordedCommit =
            operation.resourceIds?.pushedCommit ??
            operation.release?.sourceCommit;
          const currentCommit = await readGitHead(
            project.directory,
            gitCommand(),
          );
          if (recordedCommit && currentCommit !== recordedCommit) {
            throw new Error(
              `The current HEAD ${currentCommit} does not match operation ${operationId}'s recorded commit ${recordedCommit}. Use a new operation ID for the new commit.`,
            );
          }
          const sourceCommit = recordedCommit ?? currentCommit;
          if (!operation.artifact && !operation.resourceIds?.uploadId) {
            await assertGitWorktreeClean(project.directory, gitCommand());
          }
          if (!recordedCommit) {
            await pushHubRepository({
              cloneUrl: repository.cloneUrl,
              directory: project.directory,
              accessToken: credential.accessToken,
              branch: repository.defaultBranch,
              hub: normalizedHub,
              gitCommand: gitCommand(),
            });
            await updateOperation(operationId, (current) => ({
              ...current,
              resourceIds: {
                ...(current.resourceIds ?? {}),
                applicationId: application.id,
                pushedCommit: sourceCommit,
              },
              step: 'pushed',
            }));
          }

          const artifact = await resolvePublishArtifact({
            applicationSlug: application.slug,
            directory: project.directory,
            operation,
            operationId,
            sourceCommit,
            version,
          });
          const releaseMetadata = {
            version,
            sourceCommit,
            checksum: artifact.checksum,
            sizeBytes: artifact.sizeBytes,
            archiveChecksum: artifact.archiveChecksum,
            archiveSizeBytes: artifact.archiveSizeBytes,
            archiveFormat: artifact.archiveFormat,
            manifest: { ...artifact.manifest },
          };
          await updateOperation(operationId, (current) => ({
            ...current,
            resourceIds: {
              ...(current.resourceIds ?? {}),
              applicationId: application.id,
            },
            release: releaseMetadata,
            step:
              current.step === 'initialized' || current.step === 'pushed'
                ? 'built'
                : current.step,
          }));

          const refreshedOperation = await loadOperation(operationId);
          if (!refreshedOperation) {
            throw new Error(`Operation journal ${operationId} disappeared.`);
          }
          const upload = refreshedOperation.resourceIds?.uploadId
            ? await client.getReleaseUpload(
                refreshedOperation.resourceIds.uploadId,
              )
            : await client.createReleaseUpload(
                application.id,
                releaseMetadata,
                operationId,
              );
          await updateOperation(operationId, (entry) => ({
            ...entry,
            resourceIds: {
              ...(entry.resourceIds ?? {}),
              applicationId: application.id,
              uploadId: upload.id,
            },
            step: 'upload-created',
          }));
          const cached = await verifyCachedOperationArtifact(operationId);
          if (upload.status === 'created') {
            await client.putReleaseUploadContent(
              upload,
              await readFile(cached.path),
            );
            await updateOperation(operationId, (entry) => ({
              ...entry,
              step: 'uploaded',
            }));
          }
          let completed = upload;
          if (completed.status !== 'completed') {
            await client.completeReleaseUpload(upload.id, operationId);
            try {
              completed = await waitForUpload(client, upload.id);
            } catch (error) {
              if (
                error instanceof HubApiError &&
                error.code === 'RELEASE_VERSION_CONFLICT' &&
                flags.bump
              ) {
                suggestedVersion = resolveReleaseVersion({
                  bump: flags.bump as 'patch' | 'minor' | 'major',
                  releases: await listAllReleases(client, application.id),
                });
              }
              throw error;
            }
          }
          const release = completed.release;
          if (!release?.id) {
            throw new Error(
              'Hub completed the upload without returning a Release.',
            );
          }
          await updateOperation(operationId, (entry) => ({
            ...entry,
            resourceIds: {
              ...(entry.resourceIds ?? {}),
              applicationId: application.id,
              uploadId: upload.id,
              releaseId: release.id,
            },
            step: 'release-completed',
          }));
          let deployment:
            import('../../lib/hub-client.ts').Deployment | undefined;
          if (flags.deploy) {
            const current = await loadOperation(operationId);
            const created = current?.resourceIds?.deploymentId
              ? await client.getDeployment(current.resourceIds.deploymentId)
              : await client.createDeployment(
                  application.id,
                  { targetReleaseId: release.id, type: 'deploy' },
                  operationId,
                );
            await updateOperation(operationId, (entry) => ({
              ...entry,
              deployment: toOperationDeployment(created),
              resourceIds: {
                ...(entry.resourceIds ?? {}),
                deploymentId: created.id,
              },
              step: 'deployment-created',
            }));
            deployment = await waitForDeployment(client, created);
            await updateOperation(operationId, (entry) => ({
              ...entry,
              deployment: toOperationDeployment(deployment!),
              resourceIds: {
                ...(entry.resourceIds ?? {}),
                deploymentId: deployment!.id,
              },
              step: 'completed',
            }));
          }
          await updateOperation(operationId, (entry) => ({
            ...entry,
            step: 'completed',
          }));
          return { application, deployment, release, version };
        },
      );
      const output = {
        ok: true,
        operationId,
        application: {
          id: result.application.id,
          slug: result.application.slug,
          name: result.application.name,
          url: result.application.links?.open ?? null,
        },
        ...(result.dryRun
          ? { dryRun: true, plan: { version: result.version } }
          : {
              release: result.release,
              ...(result.deployment ? { deployment: result.deployment } : {}),
            }),
      };
      if (flags.json) {
        this.log(JSON.stringify(output));
      } else if (result.dryRun) {
        this.log(
          `Dry run: publish ${result.application.slug} ${result.version}.`,
        );
      } else {
        this.log(`Published ${result.application.slug} ${result.version}.`);
        this.log(`operation_id: ${operationId}`);
      }
    } catch (error) {
      const journal = await loadOperation(operationId).catch(() => undefined);
      const failureHint = publishFailureHint({
        error,
        flags,
        hub,
        operationId,
        projectDirectory,
        recordedParameters: journal?.parameters,
        suggestedVersion,
      });
      failHubCommand(this, error, flags.json, failureHint, operationId, {
        ...(journal?.release && journal.resourceIds?.releaseId
          ? {
              release: {
                id: journal.resourceIds.releaseId,
                version: journal.release.version,
                sourceCommit: journal.release.sourceCommit,
              },
            }
          : {}),
        ...(journal?.deployment ? { deployment: journal.deployment } : {}),
      });
    }
  }
}

async function prepareArtifact(
  directory: string,
  applicationSlug: string,
  sourceCommit: string,
  operationId: string,
): Promise<BuiltReleaseArtifact> {
  const project = path.resolve(directory);
  const manifestPath = path.join(project, 'package.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
    packageManager?: string;
    scripts?: Record<string, string>;
  };
  if (!manifest.scripts?.build) {
    throw new AppBuildError(
      'The app package.json does not define a build script.',
    );
  }
  const packageManager = await detectPackageManager(
    project,
    manifest.packageManager,
  );
  try {
    await runCommand(packageManager, ['run', 'build'], {
      cwd: project,
      env: createBuildEnvironment(applicationSlug),
    });
  } catch (error) {
    throw new AppBuildError('The app build command failed.', { cause: error });
  }
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'nb3-publish-'));
  const outputPath = path.join(temporary, 'release.tar.gz');
  try {
    const artifact = await buildReleaseArtifact({
      applicationSlug,
      buildDirectory: path.join(project, 'dist'),
      outputPath,
      sourceCommit,
    });
    await cacheOperationArtifact(
      operationId,
      artifact.path,
      artifact.archiveChecksum,
    );
    return artifact;
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

async function resolvePublishArtifact(options: {
  readonly applicationSlug: string;
  readonly directory: string;
  readonly operation: Awaited<ReturnType<typeof createOperation>>;
  readonly operationId: string;
  readonly sourceCommit: string;
  readonly version: string;
}): Promise<BuiltReleaseArtifact> {
  const cached = options.operation.artifact;
  const release = options.operation.release;
  if (cached || options.operation.resourceIds?.uploadId) {
    if (!cached || !release) {
      throw new Error(
        'The publish operation has remote state but no local release metadata. Use a new operation ID after checking the Hub upload.',
      );
    }
    if (
      release.version !== options.version ||
      release.sourceCommit !== options.sourceCommit
    ) {
      throw new Error(
        'The resumed publish operation does not match the requested version or source commit. Use a new operation ID.',
      );
    }
    const verified = await verifyCachedOperationArtifact(options.operationId);
    return {
      path: verified.path,
      manifest: restoreReleaseManifest(release.manifest),
      checksum: release.checksum,
      sizeBytes: release.sizeBytes,
      archiveChecksum: release.archiveChecksum,
      archiveSizeBytes: release.archiveSizeBytes,
      archiveFormat: 'tar.gz',
    };
  }
  return prepareArtifact(
    options.directory,
    options.applicationSlug,
    options.sourceCommit,
    options.operationId,
  );
}

function createBuildEnvironment(applicationSlug: string): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined || isSensitiveEnvironmentKey(key)) continue;
    environment[key] = value;
  }
  environment.APP_BASE_PATH = `/${applicationSlug}`;
  environment.APP_BROWSER_BASE_PATH = `/${applicationSlug}`;
  environment.NODE_ENV = 'production';
  return environment;
}

function isSensitiveEnvironmentKey(key: string): boolean {
  return /(?:token|secret|password|credential|private[_-]?key|api[_-]?key)/i.test(
    key,
  );
}

function restoreReleaseManifest(
  value: Readonly<Record<string, unknown>>,
): ReleaseManifest {
  const client = recordValue(value.client);
  const server = recordValue(value.server);
  const source = recordValue(value.source);
  if (
    value.schemaVersion !== 1 ||
    typeof value.basePath !== 'string' ||
    client.rootDir !== 'dist/client' ||
    server.entrypoint !== 'dist/server/embedded.js' ||
    server.healthPath !== '/api/healthz' ||
    typeof source.commit !== 'string'
  ) {
    throw new Error(
      'The publish operation contains an invalid Release manifest. Use a new operation ID.',
    );
  }
  return {
    schemaVersion: 1,
    basePath: value.basePath,
    client: { rootDir: 'dist/client' },
    server: {
      entrypoint: 'dist/server/embedded.js',
      healthPath: '/api/healthz',
    },
    source: { commit: source.commit },
  };
}

function recordValue(value: unknown): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Readonly<Record<string, unknown>>;
}

async function waitForUpload(
  client: import('../../lib/hub-client.ts').HubClient,
  uploadId: string,
): Promise<ReleaseUpload> {
  const deadline = Date.now() + 10 * 60_000;
  for (;;) {
    const upload = await client.getReleaseUpload(uploadId);
    if (upload.status === 'completed') return upload;
    if (upload.status === 'failed' || upload.status === 'expired') {
      throw new HubApiError(
        upload.failure?.message ?? `Hub Release upload ${upload.status}.`,
        {
          code:
            upload.failure?.code ??
            (upload.status === 'expired'
              ? 'RELEASE_UPLOAD_EXPIRED'
              : 'RELEASE_UPLOAD_FAILED'),
          status: upload.status === 'expired' ? 410 : 409,
        },
      );
    }
    if (Date.now() >= deadline)
      throw new Error('Hub Release upload timed out.');
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

function toOperationDeployment(
  deployment: import('../../lib/hub-client.ts').Deployment,
): import('../../lib/operation-store.ts').OperationDeployment {
  return {
    id: deployment.id,
    applicationId: deployment.applicationId,
    targetReleaseId: deployment.targetReleaseId,
    type: deployment.type,
    status: deployment.status,
  };
}

function publishFailureHint(options: {
  readonly error: unknown;
  readonly flags: {
    readonly bump?: string;
    readonly deploy: boolean;
    readonly dir?: string;
    readonly 'dry-run': boolean;
    readonly version?: string;
  };
  readonly hub?: string;
  readonly operationId: string;
  readonly projectDirectory?: string;
  readonly recordedParameters?: Readonly<Record<string, string>>;
  readonly suggestedVersion?: string;
}): string {
  const parts = ['nb3', 'app', 'publish'];
  const parameters = options.recordedParameters;
  const recordedVersion = parameterValue(parameters?.version);
  const recordedBump = parameterValue(parameters?.bump);
  const version = recordedVersion ?? options.flags.version;
  const bump = recordedBump ?? options.flags.bump;
  const deploy = parameters
    ? parameters.deploy === 'true'
    : options.flags.deploy;
  const dryRun = parameters
    ? parameters.dryRun === 'true'
    : options.flags['dry-run'];
  if (options.projectDirectory) parts.push('--dir', options.projectDirectory);
  if (options.hub) parts.push('--hub', options.hub);
  if (
    options.error instanceof HubApiError &&
    options.error.code === 'RELEASE_VERSION_CONFLICT' &&
    options.suggestedVersion
  ) {
    parts.push('--version', options.suggestedVersion);
  } else if (version) {
    parts.push('--version', version);
  } else if (bump) {
    parts.push('--bump', bump);
  }
  if (deploy) parts.push('--deploy');
  if (dryRun) parts.push('--dry-run');
  if (!options.suggestedVersion) {
    parts.push('--operation-id', options.operationId);
  }
  parts.push('--non-interactive');
  return formatShellCommand(parts);
}

function parameterValue(value: string | undefined): string | undefined {
  return value && value !== 'none' ? value : undefined;
}

function gitCommand(): string {
  return 'git';
}
