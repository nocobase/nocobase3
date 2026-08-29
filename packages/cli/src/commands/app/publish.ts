import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Command, Flags } from '@oclif/core';

import { requireAppProject, writeAppConfig } from '../../lib/app-project.ts';
import { CommandProgress } from '../../lib/command-progress.ts';
import { HubCredentialManager } from '../../lib/hub-auth.ts';
import { AppBuildError, failHubCommand } from '../../lib/hub-command.ts';
import {
  HubApiError,
  normalizeHubUrl,
  type ReleaseUpload,
} from '../../lib/hub-client.ts';
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
import {
  listAllReleases,
  resolveApplication,
  waitForDeployment,
} from '../../lib/hub-workflow.ts';

export default class AppPublish extends Command {
  static override summary = 'Build and publish the current app as a Release.';
  static override description =
    'Builds a deterministic Release artifact from the local app, uploads it to the Hub, and optionally deploys the verified Release.';

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
    app: Flags.string({
      description:
        'Existing application ID or exact slug to bind. Omit to create a new Hub app on first release.',
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
      description: 'Validate the publish plan without creating or uploading.',
    }),
    json: Flags.boolean({
      default: false,
      description: 'Print one JSON result to stdout.',
    }),
    'operation-id': Flags.string({
      description: 'Resume or replay this publish operation.',
    }),
  };

  protected get publishSurface(): 'deploy' | 'publish' | 'release' {
    return isAppScriptSurface(this) ? 'release' : 'publish';
  }

  public async run(): Promise<void> {
    const { flags } = await this.parse(AppPublish);
    const operationId = flags['operation-id'] ?? randomUUID();
    let hub: string | undefined = flags.hub;
    let projectDirectory: string | undefined = flags.dir;
    let progress: CommandProgress | undefined;
    let suggestedVersion: string | undefined;
    try {
      const project = await requireAppProject(flags.dir);
      projectDirectory = project.directory;
      assertAssociationFlags(project.config, flags.hub, flags.app);
      const normalizedHub = normalizeHubUrl(hub ?? project.config.hub ?? '');
      hub = normalizedHub;
      const applicationSlug =
        project.config.slug ?? applicationSlugForName(project.config.name);
      const commandProgress = new CommandProgress(
        `${flags.deploy ? 'Deploying' : 'Releasing'} ${applicationSlug}`,
        flags.deploy ? 6 : 5,
        !flags['dry-run'],
      );
      progress = commandProgress;
      const needsAssociation = !project.config.applicationId;
      const createsApplication = needsAssociation && !flags.app;
      const operation = await createOperation({
        kind: 'app-publish',
        operationId,
        hubUrl: normalizedHub,
        idempotencyKey: operationId,
        parameters: {
          app: flags.app ?? 'none',
          bump: flags.bump ?? 'none',
          deploy: String(flags.deploy),
          dryRun: String(flags['dry-run']),
          version: flags.version ?? 'none',
        },
        step: 'initialized',
      });
      const requiredScopes = [
        'apps:read',
        ...(createsApplication ? (['apps:create'] as const) : []),
        'releases:publish',
        ...(flags.bump ? (['releases:read'] as const) : []),
        ...(flags.deploy
          ? (['deployments:deploy', 'deployments:read'] as const)
          : []),
      ] as const;
      const manager = new HubCredentialManager(normalizedHub);
      const operationCallback = async (
        client: import('../../lib/hub-client.ts').HubClient,
      ) => {
        commandProgress.report('Resolving application');
        const application = await resolvePublishApplication({
          applicationReference: flags.app,
          client,
          create: createsApplication,
          dryRun: flags['dry-run'],
          localApplicationId: project.config.applicationId,
          name: project.config.name,
          operationApplicationId: operation.resourceIds?.applicationId,
          operationId,
          slug: applicationSlug,
        });
        if (
          operation.resourceIds?.applicationId &&
          operation.resourceIds.applicationId !== application.id
        ) {
          throw new Error(
            `Operation ${operationId} belongs to application ${operation.resourceIds.applicationId}, not ${application.id}. Use a new operation ID.`,
          );
        }
        assertResolvedApplicationMatchesProject(project.config, application);
        if (!flags['dry-run']) {
          const linkedConfig = linkedAppConfig(
            project.config,
            normalizedHub,
            application,
          );
          await writeAppConfig(project, linkedConfig);
          project.config = linkedConfig;
          await updateOperation(operationId, (current) => ({
            ...current,
            resourceIds: {
              ...(current.resourceIds ?? {}),
              applicationId: application.id,
            },
            step: current.step === 'initialized' ? 'associated' : current.step,
          }));
        }
        const releases =
          operation.release ||
          flags.version ||
          !flags.bump ||
          application.status === 'planned'
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
            version,
          };
        }

        const artifact = await resolvePublishArtifact({
          applicationSlug: application.slug,
          directory: project.directory,
          operation,
          operationId,
          progress: commandProgress,
          version,
        });
        const releaseMetadata = {
          version,
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
            current.step === 'initialized' || current.step === 'associated'
              ? 'built'
              : current.step,
        }));

        const refreshedOperation = await loadOperation(operationId);
        if (!refreshedOperation) {
          throw new Error(`Operation journal ${operationId} disappeared.`);
        }
        commandProgress.report('Uploading Release');
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
        commandProgress.report('Verifying Release');
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
          commandProgress.report('Deploying Release');
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
      };
      const result =
        isAppScriptSurface(this) && !flags['dry-run']
          ? await manager.authorizedWithDeviceLogin(
              requiredScopes,
              {
                clientName: `NocoBase app scripts on ${os.hostname() || 'device'}`,
                reportAuthorization: (authorization) =>
                  reportAuthorization(this, authorization, flags.json),
              },
              operationCallback,
            )
          : await manager.authorized(requiredScopes, operationCallback);
      commandProgress.stop();
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
        const action =
          this.publishSurface === 'deploy'
            ? 'Released and deployed'
            : this.publishSurface === 'release'
              ? 'Released'
              : 'Published';
        this.log(`${action} ${result.application.slug} ${result.version}.`);
        this.log(`operation_id: ${operationId}`);
      }
    } catch (error) {
      progress?.stop('failed');
      const journal = await loadOperation(operationId).catch(() => undefined);
      const failureHint = publishFailureHint({
        error,
        flags,
        hub,
        operationId,
        projectDirectory,
        recordedParameters: journal?.parameters,
        suggestedVersion,
        surface: this.publishSurface,
      });
      failHubCommand(this, error, flags.json, failureHint, operationId, {
        ...(journal?.release && journal.resourceIds?.releaseId
          ? {
              release: {
                id: journal.resourceIds.releaseId,
                version: journal.release.version,
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
  operationId: string,
  progress: CommandProgress,
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
  progress.report('Building application');
  try {
    await runCommand(packageManager, ['run', 'build'], {
      cwd: project,
      env: createBuildEnvironment(applicationSlug),
    });
  } catch (error) {
    throw new AppBuildError('The app build command failed.', { cause: error });
  }
  progress.report('Packaging Release');
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'nb3-publish-'));
  const outputPath = path.join(temporary, 'release.tar.gz');
  try {
    const artifact = await buildReleaseArtifact({
      applicationSlug,
      buildDirectory: path.join(project, 'dist'),
      outputPath,
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
  readonly progress: CommandProgress;
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
    if (release.version !== options.version) {
      throw new Error(
        'The resumed publish operation does not match the requested version. Use a new operation ID.',
      );
    }
    options.progress.report('Reusing cached application build');
    const verified = await verifyCachedOperationArtifact(options.operationId);
    options.progress.report('Loading cached Release package');
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
    options.operationId,
    options.progress,
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
  if (
    value.schemaVersion !== 1 ||
    typeof value.basePath !== 'string' ||
    client.rootDir !== 'dist/client' ||
    server.entrypoint !== 'dist/server/embedded.js' ||
    server.healthPath !== '/api/healthz'
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
    readonly app?: string;
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
  readonly surface: 'deploy' | 'publish' | 'release';
}): string {
  const parts =
    options.surface === 'publish'
      ? ['nb3', 'app', 'publish']
      : ['pnpm', 'run', options.surface];
  const parameters = options.recordedParameters;
  const app =
    (options.error instanceof ApplicationBindingRequiredError
      ? options.error.slug
      : undefined) ??
    parameterValue(parameters?.app) ??
    options.flags.app;
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
  if (app) parts.push('--app', app);
  if (
    options.surface !== 'deploy' &&
    options.error instanceof HubApiError &&
    options.error.code === 'RELEASE_VERSION_CONFLICT' &&
    options.suggestedVersion
  ) {
    parts.push('--version', options.suggestedVersion);
  } else if (options.surface !== 'deploy' && version) {
    parts.push('--version', version);
  } else if (options.surface !== 'deploy' && bump) {
    parts.push('--bump', bump);
  }
  if (deploy && options.surface !== 'deploy') parts.push('--deploy');
  if (dryRun) parts.push('--dry-run');
  if (
    !options.suggestedVersion &&
    !(options.error instanceof ApplicationBindingRequiredError)
  ) {
    parts.push('--operation-id', options.operationId);
  }
  parts.push('--non-interactive');
  return formatShellCommand(parts);
}

function isAppScriptSurface(command: Command): boolean {
  return command.config.bin === 'pnpm run';
}

function reportAuthorization(
  command: Command,
  authorization: import('../../lib/hub-client.ts').DeviceAuthorization,
  json: boolean,
): void {
  const lines = [
    'Authorize this device in your browser:',
    authorization.verificationUriComplete ?? authorization.verificationUri,
    `Code: ${authorization.userCode}`,
    'Waiting for approval...',
  ];
  for (const line of lines) {
    if (json) command.logToStderr(line);
    else command.log(line);
  }
}

async function resolvePublishApplication(options: {
  readonly applicationReference?: string;
  readonly client: import('../../lib/hub-client.ts').HubClient;
  readonly create: boolean;
  readonly dryRun: boolean;
  readonly localApplicationId?: string;
  readonly name: string;
  readonly operationApplicationId?: string;
  readonly operationId: string;
  readonly slug: string;
}): Promise<import('../../lib/hub-client.ts').ApplicationSummary> {
  const reference =
    options.operationApplicationId ??
    options.localApplicationId ??
    options.applicationReference;
  if (reference) return resolveApplication(options.client, reference);
  if (options.dryRun) {
    return {
      id: `dry-run:${options.slug}`,
      slug: options.slug,
      name: options.name,
      status: 'planned',
    };
  }
  if (!options.create) {
    throw new Error(
      'No Hub application is associated with this project. Pass --app <slug> to bind an existing application.',
    );
  }
  try {
    return await options.client.createApplication(
      { name: options.name, slug: options.slug },
      options.operationId,
    );
  } catch (error) {
    if (error instanceof HubApiError && error.status === 409) {
      throw new ApplicationBindingRequiredError(
        options.slug,
        `Application slug "${options.slug}" already exists. Pass --app ${options.slug} to bind it explicitly.`,
        { cause: error },
      );
    }
    throw error;
  }
}

class ApplicationBindingRequiredError extends Error {
  public readonly slug: string;

  public constructor(slug: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ApplicationBindingRequiredError';
    this.slug = slug;
  }
}

function applicationSlugForName(name: string): string {
  const candidate = (name.split('/').at(-1) ?? name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!candidate) {
    throw new Error(
      'The package name cannot be converted to an application slug. Set a lowercase package name containing letters or numbers.',
    );
  }
  return candidate;
}

function assertAssociationFlags(
  config: import('../../lib/scaffold.ts').AppConfig,
  requestedHub: string | undefined,
  requestedApplication: string | undefined,
): void {
  if (
    config.hub &&
    requestedHub &&
    normalizeHubUrl(config.hub) !== normalizeHubUrl(requestedHub)
  ) {
    throw new Error(
      `This project is already associated with Hub ${normalizeHubUrl(config.hub)}. Remove --hub or use the associated Hub.`,
    );
  }
  if (
    config.applicationId &&
    requestedApplication &&
    requestedApplication !== config.applicationId &&
    requestedApplication !== config.slug
  ) {
    throw new Error(
      `This project is already associated with application ${config.slug ?? config.applicationId}. Remove --app or use the associated application.`,
    );
  }
}

function assertResolvedApplicationMatchesProject(
  config: import('../../lib/scaffold.ts').AppConfig,
  application: import('../../lib/hub-client.ts').ApplicationSummary,
): void {
  if (config.applicationId && config.applicationId !== application.id) {
    throw new Error(
      `This project is associated with application ${config.applicationId}, not ${application.id}.`,
    );
  }
  if (config.slug && config.slug !== application.slug) {
    throw new Error(
      `This project is associated with application slug ${config.slug}, not ${application.slug}.`,
    );
  }
}

function linkedAppConfig(
  config: import('../../lib/scaffold.ts').AppConfig,
  hub: string,
  application: import('../../lib/hub-client.ts').ApplicationSummary,
): import('../../lib/scaffold.ts').AppConfig {
  return {
    name: config.name,
    hub,
    applicationId: application.id,
    slug: application.slug,
    ...(config.template ? { template: config.template } : {}),
    ...(config.templateVersion
      ? { templateVersion: config.templateVersion }
      : {}),
  };
}

function parameterValue(value: string | undefined): string | undefined {
  return value && value !== 'none' ? value : undefined;
}
