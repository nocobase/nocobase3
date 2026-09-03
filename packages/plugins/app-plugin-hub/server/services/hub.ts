import { createHash, randomUUID } from 'node:crypto';
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type {
  HostDeploymentSet,
  HostDeploymentSpec,
  HostDeploymentStatus,
  HostManagementService,
  HostStatus,
} from '@nocobase/app-host/management';
import { AppHostSupervisor } from '@nocobase/app-host/supervisor';
import type { DatabaseConnection, DatabaseManager, Row } from '@nocobase/db';
import {
  createDriveManager,
  type AppDriveDiskConfig,
  type NocoBaseDriveDisk,
} from '@nocobase/drive';
import { x as extractTar } from 'tar';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

import type { HubPluginConfig } from '../config.js';
import type {
  CreateHubAppInput,
  CreateHubReleaseInput,
  DeployHubAppInput,
  HubAppDetail,
  HubAppRecord,
  HubConfigDocument,
  HubConfigMode,
  HubDeploymentRecord,
  HubObservedState,
  HubReleaseRecord,
  HubService,
  SaveHubConfigInput,
  UpdateHubSettingsInput,
} from '../tokens.js';

const MAX_ARTIFACT_SIZE = 256 * 1024 * 1024;
const APP_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
const RELEASE_VERSION_PATTERN = /^[0-9A-Za-z][0-9A-Za-z._+-]{0,254}$/;
const CONFIG_TEMPLATE_PATH = 'config.yml';
const EMBEDDED_ENTRY_PATH = 'dist/server/embedded.js';

export interface DefaultHubServiceOptions {
  readonly database: DatabaseManager;
  readonly config: HubPluginConfig;
  readonly hostController?: HubHostController;
}

export interface HubHostController {
  ensureStarted(): Promise<URL>;
  applyDeploymentSet(
    deploymentSet: HostDeploymentSet,
  ): Promise<{ readonly status: HostStatus }>;
  applyDeployment(deployment: HostDeploymentSpec): Promise<HostStatus>;
  startDeployment(deployment: HostDeploymentSpec): Promise<HostStatus>;
  stopDeployment(appId: string): Promise<HostStatus>;
  removeDeployment(appId: string): Promise<HostStatus>;
  getManagementClient(): Promise<HostManagementService>;
  shutdown(): Promise<void>;
}

export class HubError extends Error {
  public constructor(
    message: string,
    public readonly code: string,
    public readonly status: 400 | 404 | 409 | 413 | 422 | 503,
  ) {
    super(message);
    this.name = 'HubError';
  }
}

export class DefaultHubService implements HubService {
  private readonly disk: NocoBaseDriveDisk;
  private readonly hostController: HubHostController;
  private readonly ownsHostController: boolean;
  private readonly locks = new Map<string, Promise<unknown>>();
  private revision = 0;
  private currentHostUrl: string | null = null;

  public constructor(private readonly options: DefaultHubServiceOptions) {
    const drive = createDriveManager({
      default: 'artifact',
      disks: { artifact: options.config.artifact },
      links: {},
    });
    this.disk = drive.use('artifact');
    this.ownsHostController = options.hostController === undefined;
    this.hostController =
      options.hostController ??
      AppHostSupervisor.getInstance({
        mode: 'managed',
        enabled: options.config.host.enabled,
        driver: options.config.host.driver,
        appDeploymentsDir: options.config.host.deploymentsDir,
        appVolumesDir: options.config.host.volumesDir,
        configPath: options.config.host.configPath,
        prestart: false,
      });
  }

  public async prepare(): Promise<void> {
    await mkdir(path.dirname(this.options.config.host.configPath), {
      recursive: true,
      mode: 0o700,
    });
    await mkdir(this.options.config.host.volumesDir, {
      recursive: true,
      mode: 0o700,
    });
    await this.writeHostConfig();
  }

  public async listApps(): Promise<readonly HubAppDetail[]> {
    const apps = await this.query()
      .selectFrom('hubApps')
      .selectAll()
      .orderBy('createdAt', 'desc')
      .execute<Row>();
    return await Promise.all(apps.map((row) => this.detail(decodeApp(row))));
  }

  public async getApp(appId: string): Promise<HubAppDetail> {
    return await this.detail(await this.requireApp(appId));
  }

  public async createApp(input: CreateHubAppInput): Promise<HubAppDetail> {
    const id = input.id.trim();
    const name = input.name.trim();
    if (!APP_ID_PATTERN.test(id)) {
      throw new HubError(
        'App ID may contain only letters, numbers, underscores, and hyphens.',
        'INVALID_APP_ID',
        422,
      );
    }
    if (!name) {
      throw new HubError('App name is required.', 'INVALID_APP_NAME', 422);
    }
    if (await this.findApp(id)) {
      throw new HubError(`App "${id}" already exists.`, 'APP_EXISTS', 409);
    }
    const now = new Date();
    const app: HubAppRecord = {
      id,
      name,
      description: input.description?.trim() || null,
      createdAt: now,
      updatedAt: now,
    };
    const deployment: HubDeploymentRecord = {
      id: randomUUID(),
      appId: id,
      desiredReleaseId: null,
      observedReleaseId: null,
      desiredState: 'stopped',
      observedState: 'stopped',
      observedRevision: null,
      basePath: `/${id}`,
      backend: 'in-process',
      activation: 'eager',
      config: { mode: 'file' },
      error: null,
      createdAt: now,
      updatedAt: now,
    };
    await this.options.database.transaction(async (connection) => {
      await connection.query
        .insertInto('hubApps')
        .values(encodeApp(app))
        .execute();
      await connection.query
        .insertInto('hubAppDeployments')
        .values(encodeDeployment(deployment))
        .execute();
    });
    return { app, deployment, releases: [], hostUrl: this.currentHostUrl };
  }

  public async listReleases(
    appId: string,
  ): Promise<readonly HubReleaseRecord[]> {
    await this.requireApp(appId);
    const rows = await this.query()
      .selectFrom('hubAppReleases')
      .selectAll()
      .where('appId', '=', appId)
      .orderBy('createdAt', 'desc')
      .execute<Row>();
    return rows.map(decodeRelease);
  }

  public async getRelease(
    appId: string,
    releaseId: string,
  ): Promise<HubReleaseRecord> {
    const row = await this.query()
      .selectFrom('hubAppReleases')
      .selectAll()
      .where('id', '=', releaseId)
      .where('appId', '=', appId)
      .executeTakeFirst<Row>();
    if (!row) {
      throw new HubError('Release not found.', 'RELEASE_NOT_FOUND', 404);
    }
    return decodeRelease(row);
  }

  public async createRelease(
    appId: string,
    input: CreateHubReleaseInput,
  ): Promise<HubReleaseRecord> {
    await this.requireApp(appId);
    if (
      input.bytes.byteLength === 0 ||
      input.bytes.byteLength > MAX_ARTIFACT_SIZE
    ) {
      throw new HubError(
        `Artifact must be between 1 byte and ${MAX_ARTIFACT_SIZE} bytes.`,
        'INVALID_ARTIFACT_SIZE',
        413,
      );
    }
    const metadata = await inspectArtifact(input.bytes);
    const { version } = metadata;
    const duplicate = await this.query()
      .selectFrom('hubAppReleases')
      .select('id')
      .where('appId', '=', appId)
      .where('version', '=', version)
      .executeTakeFirst<Row>();
    if (duplicate) {
      throw new HubError(
        `Release "${version}" already exists for app "${appId}".`,
        'RELEASE_EXISTS',
        409,
      );
    }
    const id = randomUUID();
    const artifactKey = `${appId}/${id}.tar.gz`;
    const release: HubReleaseRecord = {
      id,
      appId,
      version,
      artifactKey,
      checksum: sha256(input.bytes),
      size: input.bytes.byteLength,
      configTemplate: metadata.configTemplate,
      createdAt: new Date(),
    };
    await this.disk.put(artifactKey, input.bytes, {
      visibility: 'private',
      contentType: 'application/gzip',
    });
    try {
      await this.query()
        .insertInto('hubAppReleases')
        .values(encodeRelease(release))
        .execute();
    } catch (error) {
      await this.disk.delete(artifactKey).catch(() => undefined);
      throw error;
    }
    return release;
  }

  public async readConfig(appId: string): Promise<HubConfigDocument> {
    const deployment = await this.requireDeployment(appId);
    if (deployment.config.mode !== 'file') {
      return { mode: deployment.config.mode, content: null, path: null };
    }
    const configPath = this.configPath(deployment);
    try {
      return {
        mode: 'file',
        content: await readFile(configPath, 'utf8'),
        path: configPath,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { mode: 'file', content: '', path: configPath };
      }
      throw error;
    }
  }

  public async saveConfig(
    appId: string,
    input: SaveHubConfigInput,
  ): Promise<HubConfigDocument> {
    return await this.withLock(appId, async () => {
      const deployment = await this.requireDeployment(appId);
      assertConfigMode(input.mode);
      if (input.mode === 'file') {
        if (typeof input.content !== 'string') {
          throw new HubError(
            'File configuration content is required.',
            'INVALID_CONFIG_FILE',
            422,
          );
        }
        validateYamlConfig(input.content);
        await writeTextAtomic(this.configPath(deployment), input.content);
      }
      await this.updateDeployment(appId, {
        config: {
          mode: input.mode,
          ...(deployment.config.path ? { path: deployment.config.path } : {}),
        },
      });
      return await this.readConfig(appId);
    });
  }

  public async deploy(
    appId: string,
    input: DeployHubAppInput,
  ): Promise<HubAppDetail> {
    return await this.withLock(appId, async () => {
      const release = await this.getRelease(appId, input.releaseId);
      const deployment = await this.requireDeployment(appId);
      if (deployment.config.mode === 'file') {
        await this.initializeConfigFromRelease(deployment, release);
      }
      await this.updateDeployment(appId, {
        desiredReleaseId: release.id,
        desiredState: 'running',
        observedState: 'pending',
        error: null,
      });

      try {
        const hostStatus = await this.hostController.applyDeployment(
          await this.createDeploymentSpec(appId),
        );
        const status = hostStatus.deployments.find(
          (candidate) => candidate.appId === appId,
        );
        if (!status || status.observedState === 'failed') {
          throw new Error(
            status?.error ?? 'Host did not report deployment status.',
          );
        }
        await this.observe(status);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await this.updateDeployment(appId, {
          desiredReleaseId: deployment.desiredReleaseId,
          desiredState: deployment.desiredState,
          observedState: deployment.observedState,
          error: message,
        });
        throw new HubError(
          `Deployment failed: ${message}`,
          'DEPLOYMENT_FAILED',
          503,
        );
      }
      return await this.getApp(appId);
    });
  }

  public async updateSettings(
    appId: string,
    input: UpdateHubSettingsInput,
  ): Promise<HubAppDetail> {
    return await this.withLock(appId, async () => {
      assertActivation(input.activation);
      const deployment = await this.requireDeployment(appId);
      await this.updateDeployment(appId, {
        activation: input.activation,
        ...(deployment.desiredReleaseId
          ? { observedState: 'pending', error: null }
          : {}),
      });
      if (!deployment.desiredReleaseId) return await this.getApp(appId);
      try {
        const hostStatus = await this.hostController.applyDeployment(
          await this.createDeploymentSpec(appId),
        );
        const status = hostStatus.deployments.find(
          (candidate) => candidate.appId === appId,
        );
        if (!status || status.observedState === 'failed') {
          throw new Error(
            status?.error ?? 'Host did not report deployment status.',
          );
        }
        await this.observe(status);
      } catch (error) {
        await this.updateDeployment(appId, {
          activation: deployment.activation,
          observedState: deployment.observedState,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return await this.getApp(appId);
    });
  }

  public async start(appId: string): Promise<HubAppDetail> {
    return await this.withLock(appId, async () => {
      const deployment = await this.requireDeployment(appId);
      if (!deployment.desiredReleaseId) {
        throw new HubError(
          'App must be deployed before it can be started.',
          'APP_NOT_DEPLOYED',
          409,
        );
      }
      await this.updateDeployment(appId, {
        desiredState: 'running',
        observedState: 'pending',
        error: null,
      });
      try {
        // A manual Start activates now but preserves the saved policy used on
        // the next Hub restart.
        const spec = await this.createDeploymentSpec(appId);
        const hostStatus = await this.hostController.startDeployment(spec);
        const status = hostStatus.deployments.find(
          (candidate) => candidate.appId === appId,
        );
        if (!status || status.observedState === 'failed') {
          throw new Error(
            status?.error ?? 'Host did not report deployment status.',
          );
        }
        await this.observe(status);
      } catch (error) {
        await this.updateDeployment(appId, {
          observedState: 'failed',
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return await this.getApp(appId);
    });
  }

  public async stop(appId: string): Promise<HubAppDetail> {
    return await this.withLock(appId, async () => {
      await this.requireDeployment(appId);
      await this.updateDeployment(appId, {
        desiredState: 'stopped',
        observedState: 'pending',
        error: null,
      });
      try {
        const hostStatus = await this.hostController.stopDeployment(appId);
        const status = hostStatus.deployments.find(
          (candidate) => candidate.appId === appId,
        );
        if (status) await this.observe(status);
        else {
          await this.updateDeployment(appId, {
            observedState: 'stopped',
            error: null,
          });
        }
      } catch (error) {
        await this.updateDeployment(appId, {
          observedState: 'failed',
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return await this.getApp(appId);
    });
  }

  public async remove(appId: string): Promise<void> {
    await this.withLock(appId, async () => {
      const app = await this.requireApp(appId);
      await this.requireDeployment(appId);
      const releases = await this.listReleases(appId);
      await this.hostController.removeDeployment(appId);
      await this.options.database.transaction(async (connection) => {
        await connection.query
          .deleteFrom('hubAppReleases')
          .where('appId', '=', appId)
          .execute();
        await connection.query
          .deleteFrom('hubAppDeployments')
          .where('appId', '=', appId)
          .execute();
        await connection.query
          .deleteFrom('hubApps')
          .where('id', '=', app.id)
          .execute();
      });
      await Promise.allSettled([
        ...releases.map((release) => this.disk.delete(release.artifactKey)),
        rm(path.join(this.options.config.host.deploymentsDir, appId), {
          recursive: true,
          force: true,
        }),
        rm(path.join(this.options.config.host.volumesDir, appId), {
          recursive: true,
          force: true,
        }),
      ]);
    });
  }

  public async refresh(appId: string): Promise<HubAppDetail> {
    await this.requireApp(appId);
    const status = await this.hostStatus();
    const deployment = status.deployments.find(
      (candidate) => candidate.appId === appId,
    );
    if (deployment) await this.observe(deployment);
    return await this.getApp(appId);
  }

  public async restart(appId: string): Promise<HubAppDetail> {
    const deployment = await this.requireDeployment(appId);
    if (deployment.desiredState !== 'running') {
      throw new HubError(
        'Stopped app cannot be restarted.',
        'APP_STOPPED',
        409,
      );
    }
    const status = await (
      await this.hostController.getManagementClient()
    ).restartApp(appId);
    const observed = status.deployments.find(
      (candidate) => candidate.appId === appId,
    );
    if (observed) await this.observe(observed);
    return await this.getApp(appId);
  }

  public async hostStatus(): Promise<HostStatus> {
    return await (await this.hostController.getManagementClient()).getStatus();
  }

  public async restoreDesiredState(): Promise<void> {
    await this.prepare();
    this.currentHostUrl = (
      await this.hostController.ensureStarted()
    ).toString();
    const result = await this.hostController.applyDeploymentSet(
      await this.createDeploymentSet(),
    );
    await Promise.all(
      result.status.deployments.map((status) => this.observe(status)),
    );
  }

  public async createDeploymentSet(): Promise<HostDeploymentSet> {
    const rows = await this.query()
      .selectFrom('hubAppDeployments')
      .selectAll()
      .orderBy('appId', 'asc')
      .execute<Row>();
    const specs: HostDeploymentSpec[] = [];
    for (const row of rows) {
      const deployment = decodeDeployment(row);
      if (!deployment.desiredReleaseId) continue;
      const release = await this.getRelease(
        deployment.appId,
        deployment.desiredReleaseId,
      );
      specs.push({
        id: deployment.id,
        appId: deployment.appId,
        artifact: {
          key: release.artifactKey,
          appId: deployment.appId,
          version: release.version,
          checksum: release.checksum,
        },
        desiredState: deployment.desiredState,
        backend: deployment.backend,
        activation: deployment.activation,
        basePath: deployment.basePath,
        config:
          deployment.config.mode === 'file'
            ? { provider: 'file', path: deployment.config.path }
            : undefined,
      });
    }
    this.revision += 1;
    return { revision: this.revision, deployments: specs };
  }

  private async createDeploymentSpec(
    appId: string,
  ): Promise<HostDeploymentSpec> {
    const deployment = await this.requireDeployment(appId);
    if (!deployment.desiredReleaseId) {
      throw new HubError(
        'App must be deployed before it can be reconciled.',
        'APP_NOT_DEPLOYED',
        409,
      );
    }
    const release = await this.getRelease(appId, deployment.desiredReleaseId);
    return {
      id: deployment.id,
      appId,
      artifact: {
        key: release.artifactKey,
        appId,
        version: release.version,
        checksum: release.checksum,
      },
      desiredState: deployment.desiredState,
      backend: deployment.backend,
      activation: deployment.activation,
      basePath: deployment.basePath,
      config:
        deployment.config.mode === 'file'
          ? { provider: 'file', path: deployment.config.path }
          : undefined,
    };
  }

  public hostUrl(): string | null {
    return this.currentHostUrl;
  }

  public async shutdown(): Promise<void> {
    await this.hostController.shutdown();
    if (this.ownsHostController) AppHostSupervisor.resetInstance();
    this.currentHostUrl = null;
  }

  private query(): DatabaseConnection['query'] {
    return this.options.database.connection().query;
  }

  private async detail(app: HubAppRecord): Promise<HubAppDetail> {
    return {
      app,
      deployment: await this.requireDeployment(app.id),
      releases: await this.listReleases(app.id),
      hostUrl: this.currentHostUrl,
    };
  }

  private async findApp(appId: string): Promise<HubAppRecord | null> {
    const row = await this.query()
      .selectFrom('hubApps')
      .selectAll()
      .where('id', '=', appId)
      .executeTakeFirst<Row>();
    return row ? decodeApp(row) : null;
  }

  private async requireApp(appId: string): Promise<HubAppRecord> {
    const app = await this.findApp(appId);
    if (!app) throw new HubError('App not found.', 'APP_NOT_FOUND', 404);
    return app;
  }

  private async requireDeployment(appId: string): Promise<HubDeploymentRecord> {
    const row = await this.query()
      .selectFrom('hubAppDeployments')
      .selectAll()
      .where('appId', '=', appId)
      .executeTakeFirst<Row>();
    if (!row) {
      throw new HubError('Deployment not found.', 'DEPLOYMENT_NOT_FOUND', 404);
    }
    return decodeDeployment(row);
  }

  private async updateDeployment(
    appId: string,
    values: Partial<HubDeploymentRecord>,
  ): Promise<void> {
    await this.query()
      .updateTable('hubAppDeployments')
      .set({ ...encodePartialDeployment(values), updatedAt: new Date() })
      .where('appId', '=', appId)
      .execute();
  }

  private async observe(status: HostDeploymentStatus): Promise<void> {
    const deployment = await this.requireDeployment(status.appId);
    await this.updateDeployment(status.appId, {
      observedReleaseId:
        status.observedState === 'failed'
          ? deployment.observedReleaseId
          : deployment.desiredReleaseId,
      observedState: status.observedState,
      observedRevision: status.revision,
      error: status.error,
    });
  }

  private configPath(deployment: HubDeploymentRecord): string {
    return (
      deployment.config.path ??
      path.join(
        this.options.config.host.volumesDir,
        deployment.appId,
        'config.yml',
      )
    );
  }

  private async initializeConfigFromRelease(
    deployment: HubDeploymentRecord,
    release: HubReleaseRecord,
  ): Promise<void> {
    if (release.configTemplate === null) return;
    const configPath = this.configPath(deployment);
    try {
      await lstat(configPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      await writeTextAtomic(configPath, release.configTemplate);
    }
  }

  private async writeHostConfig(): Promise<void> {
    const document = {
      host: {
        mode: 'managed',
        server: { host: '127.0.0.1', port: 3000 },
        artifact: normalizeArtifactConfig(this.options.config.artifact),
        appDeploymentsDir: this.options.config.host.deploymentsDir,
        appVolumesDir: this.options.config.host.volumesDir,
      },
    };
    await writeStructuredConfigAtomic(
      this.options.config.host.configPath,
      document,
    );
  }

  private async withLock<T>(appId: string, work: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(appId) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(work);
    this.locks.set(appId, current);
    try {
      return await current;
    } finally {
      if (this.locks.get(appId) === current) this.locks.delete(appId);
    }
  }
}

function normalizeArtifactConfig(
  artifact: AppDriveDiskConfig,
): AppDriveDiskConfig {
  return artifact.driver === 'fs'
    ? { ...artifact, location: path.resolve(artifact.location) }
    : artifact;
}

async function inspectArtifact(bytes: Uint8Array): Promise<{
  readonly version: string;
  readonly configTemplate: string | null;
}> {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), 'nocobase-hub-artifact-'),
  );
  const archivePath = path.join(directory, 'release.tar.gz');
  try {
    await writeFile(archivePath, bytes, { mode: 0o600 });
    await extractTar({
      cwd: directory,
      file: archivePath,
      gzip: true,
      preservePaths: false,
      strict: true,
      filter: (entryPath: string): boolean => {
        const normalized = path.posix.normalize(
          entryPath.replaceAll('\\', '/'),
        );
        if (
          path.posix.isAbsolute(normalized) ||
          normalized === '..' ||
          normalized.startsWith('../')
        ) {
          throw new HubError(
            `Artifact contains unsafe path "${entryPath}".`,
            'UNSAFE_ARTIFACT',
            422,
          );
        }
        return (
          normalized === 'package.json' ||
          normalized === CONFIG_TEMPLATE_PATH ||
          normalized === EMBEDDED_ENTRY_PATH
        );
      },
    });
    await assertRegularArtifactFile(directory, 'package.json');
    await assertRegularArtifactFile(directory, EMBEDDED_ENTRY_PATH);
    const packageMetadata = JSON.parse(
      await readFile(path.join(directory, 'package.json'), 'utf8'),
    ) as { version?: unknown; app?: { version?: unknown } };
    const rawVersion = packageMetadata.app?.version ?? packageMetadata.version;
    if (
      typeof rawVersion !== 'string' ||
      !RELEASE_VERSION_PATTERN.test(rawVersion)
    ) {
      throw new HubError(
        'Artifact package.json must contain a valid version.',
        'INVALID_ARTIFACT_VERSION',
        422,
      );
    }
    const configTemplate = await readOptionalArtifactText(
      directory,
      CONFIG_TEMPLATE_PATH,
    );
    if (configTemplate !== null) validateYamlConfig(configTemplate);
    return { version: rawVersion, configTemplate };
  } catch (error) {
    if (error instanceof HubError) throw error;
    throw new HubError(
      `Invalid release artifact: ${error instanceof Error ? error.message : String(error)}`,
      'INVALID_ARTIFACT',
      422,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function writeStructuredConfigAtomic(
  filePath: string,
  content: Record<string, unknown>,
): Promise<void> {
  await writeTextAtomic(filePath, serializeConfigDocument(filePath, content));
}

async function writeTextAtomic(
  filePath: string,
  content: string,
): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temporary = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, ensureTrailingNewline(content), {
      mode: 0o600,
      flag: 'wx',
    });
    await chmod(temporary, 0o600);
    await rename(temporary, filePath);
  } finally {
    await rm(temporary, { force: true });
  }
}

function serializeConfigDocument(
  filePath: string,
  content: Record<string, unknown>,
): string {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.json') return `${JSON.stringify(content, null, 2)}\n`;
  if (extension === '.yml' || extension === '.yaml') {
    return stringifyYaml(content);
  }
  throw new HubError(
    `Unsupported config file extension "${extension || '(none)'}".`,
    'UNSUPPORTED_CONFIG_FILE',
    422,
  );
}

async function readOptionalArtifactText(
  directory: string,
  relativePath: string,
): Promise<string | null> {
  const filePath = path.join(directory, relativePath);
  try {
    const stats = await lstat(filePath);
    if (!stats.isFile()) {
      throw new HubError(
        `Artifact entry "${relativePath}" must be a regular file.`,
        'INVALID_ARTIFACT',
        422,
      );
    }
    return await readFile(filePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

function validateYamlConfig(content: string): void {
  try {
    const value: unknown =
      content.trim() === '' ? {} : (parseYaml(content) as unknown);
    if (!isRecord(value)) throw new Error('the YAML root must be an object');
  } catch (error) {
    throw new HubError(
      `Invalid config.yml: ${error instanceof Error ? error.message : String(error)}`,
      'INVALID_CONFIG_FILE',
      422,
    );
  }
}

function assertConfigMode(mode: unknown): asserts mode is HubConfigMode {
  if (mode !== 'file' && mode !== 'external') {
    throw new HubError(
      'Configuration mode must be file or external.',
      'INVALID_CONFIG_MODE',
      422,
    );
  }
}

function assertActivation(
  activation: unknown,
): asserts activation is 'lazy' | 'eager' {
  if (activation !== 'lazy' && activation !== 'eager') {
    throw new HubError(
      'Activation policy must be lazy or eager.',
      'INVALID_ACTIVATION_POLICY',
      422,
    );
  }
}

async function assertRegularArtifactFile(
  directory: string,
  relativePath: string,
): Promise<void> {
  const stats = await lstat(path.join(directory, relativePath));
  if (!stats.isFile()) {
    throw new HubError(
      `Artifact entry "${relativePath}" must be a regular file.`,
      'INVALID_ARTIFACT',
      422,
    );
  }
}

function ensureTrailingNewline(content: string): string {
  return content.endsWith('\n') ? content : `${content}\n`;
}

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function decodeApp(row: Row): HubAppRecord {
  return {
    id: String(row.id),
    name: String(row.name),
    description: nullableString(row.description),
    createdAt: decodeDate(row.createdAt),
    updatedAt: decodeDate(row.updatedAt),
  };
}

function decodeRelease(row: Row): HubReleaseRecord {
  return {
    id: String(row.id),
    appId: String(row.appId),
    version: String(row.version),
    artifactKey: String(row.artifactKey),
    checksum: String(row.checksum),
    size: Number(row.size),
    configTemplate: nullableString(row.configTemplate),
    createdAt: decodeDate(row.createdAt),
  };
}

function decodeDeployment(row: Row): HubDeploymentRecord {
  return {
    id: String(row.id),
    appId: String(row.appId),
    desiredReleaseId: nullableString(row.desiredReleaseId),
    observedReleaseId: nullableString(row.observedReleaseId),
    desiredState: row.desiredState === 'running' ? 'running' : 'stopped',
    observedState: String(row.observedState) as HubObservedState,
    observedRevision:
      row.observedRevision == null ? null : Number(row.observedRevision),
    basePath: String(row.basePath),
    backend: 'in-process',
    activation: row.activation === 'eager' ? 'eager' : 'lazy',
    config: decodeConfigBinding(row.config),
    error: nullableString(row.error),
    createdAt: decodeDate(row.createdAt),
    updatedAt: decodeDate(row.updatedAt),
  };
}

function encodeRelease(release: HubReleaseRecord): Row {
  return { ...release };
}

function encodeApp(app: HubAppRecord): Row {
  return { ...app };
}

function encodeDeployment(deployment: HubDeploymentRecord): Row {
  return { ...deployment, config: JSON.stringify(deployment.config) };
}

function encodePartialDeployment(values: Partial<HubDeploymentRecord>): Row {
  return {
    ...values,
    ...(values.config ? { config: JSON.stringify(values.config) } : {}),
  };
}

function decodeJson(value: unknown): unknown {
  return typeof value === 'string' ? (JSON.parse(value) as unknown) : value;
}

function decodeConfigBinding(value: unknown): HubDeploymentRecord['config'] {
  const decoded = decodeJson(value);
  if (!isRecord(decoded)) return { mode: 'file' };
  if (decoded.mode === 'external') {
    return { mode: 'external' };
  }
  if (decoded.mode === 'file' || decoded.provider === 'file') {
    return {
      mode: 'file',
      ...(typeof decoded.path === 'string' ? { path: decoded.path } : {}),
    };
  }
  return { mode: 'file' };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nullableString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  throw new Error('Expected a scalar database value.');
}

function decodeDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value);
  if (typeof value === 'string' && /^\d+$/u.test(value)) {
    return new Date(Number(value));
  }
  return new Date(String(value));
}
