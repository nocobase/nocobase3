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
  HubRuntimeStatus,
  HubReleaseRecord,
  RollbackHubAppInput,
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
  private startupReconciliation: Promise<void> | null = null;

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
      currentDeploymentId: null,
      enabled: false,
      basePath: `/${id}`,
      backend: 'in-process',
      startupMode: 'eager',
      createdAt: now,
      updatedAt: now,
    };
    await this.query().insertInto('hubApps').values(encodeApp(app)).execute();
    return await this.detail(app);
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
      manifest: metadata.manifest,
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
    const app = await this.requireApp(appId);
    const deployment = await this.currentDeployment(app);
    if (!deployment) return { mode: 'file', content: '', path: null };
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
      const app = await this.requireApp(appId);
      const deployment = await this.currentDeployment(app);
      if (!deployment) {
        throw new HubError(
          'App must be deployed before its configuration can be edited.',
          'APP_NOT_DEPLOYED',
          409,
        );
      }
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
      await this.updateDeployment(deployment.id, {
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
  ): Promise<HubDeploymentRecord> {
    const app = await this.requireApp(appId);
    const release = await this.getRelease(appId, input.releaseId);
    const deployment = await this.createDeploymentRecord(
      app,
      release,
      'deploy',
      null,
      input.config,
    );
    this.schedule(app.id, deployment.id);
    return deployment;
  }

  public async rollback(
    appId: string,
    input: RollbackHubAppInput,
  ): Promise<HubDeploymentRecord> {
    const app = await this.requireApp(appId);
    const target = await this.getDeployment(appId, input.deploymentId);
    if (target.status !== 'succeeded') {
      throw new HubError(
        'Only a successful deployment can be rolled back to.',
        'INVALID_ROLLBACK_TARGET',
        409,
      );
    }
    const release = await this.getRelease(appId, target.releaseId);
    const deployment = await this.createDeploymentRecord(
      app,
      release,
      'rollback',
      target.id,
      await this.configInputFromDeployment(target),
    );
    this.schedule(app.id, deployment.id);
    return deployment;
  }

  public async updateSettings(
    appId: string,
    input: UpdateHubSettingsInput,
  ): Promise<HubAppDetail> {
    return await this.withLock(appId, async () => {
      assertActivation(input.activation);
      await this.requireApp(appId);
      await this.updateApp(appId, { startupMode: input.activation });
      return await this.getApp(appId);
    });
  }

  public async start(appId: string): Promise<HubAppDetail> {
    return await this.withLock(appId, async () => {
      const app = await this.requireApp(appId);
      const deployment = await this.currentDeployment(app);
      if (!deployment) {
        throw new HubError(
          'App must be deployed before it can be started.',
          'APP_NOT_DEPLOYED',
          409,
        );
      }
      await this.updateApp(appId, { enabled: true });
      try {
        // A manual Start activates now but preserves the saved policy used on
        // the next Hub restart.
        const spec = await this.createDeploymentSpec(
          app,
          deployment,
          'running',
        );
        const hostStatus = await this.hostController.startDeployment(spec);
        const status = hostStatus.deployments.find(
          (candidate) => candidate.appId === appId,
        );
        if (!status || status.observedState === 'failed') {
          throw new Error(
            status?.error ?? 'Host did not report deployment status.',
          );
        }
      } catch (error) {
        await this.updateApp(appId, { enabled: false });
        throw new HubError(
          `Start failed: ${error instanceof Error ? error.message : String(error)}`,
          'START_FAILED',
          503,
        );
      }
      return await this.getApp(appId);
    });
  }

  public async stop(appId: string): Promise<HubAppDetail> {
    return await this.withLock(appId, async () => {
      const app = await this.requireApp(appId);
      if (!(await this.currentDeployment(app))) {
        throw new HubError('App is not deployed.', 'APP_NOT_DEPLOYED', 409);
      }
      await this.updateApp(appId, { enabled: false });
      try {
        await this.hostController.stopDeployment(appId);
      } catch (error) {
        await this.updateApp(appId, { enabled: true });
        throw new HubError(
          `Stop failed: ${error instanceof Error ? error.message : String(error)}`,
          'STOP_FAILED',
          503,
        );
      }
      return await this.getApp(appId);
    });
  }

  public async remove(appId: string): Promise<void> {
    await this.withLock(appId, async () => {
      const app = await this.requireApp(appId);
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
    return await this.getApp(appId);
  }

  public async hostStatus(): Promise<HostStatus> {
    return await (await this.hostController.getManagementClient()).getStatus();
  }

  public async restoreDesiredState(): Promise<void> {
    await this.prepare();
    const recoveredAt = new Date();
    await this.query()
      .updateTable('hubAppDeployments')
      .set({
        status: 'failed',
        phase: 'completed',
        error: 'Deployment was interrupted by a Hub restart.',
        finishedAt: recoveredAt,
      })
      .where('status', 'in', ['queued', 'deploying'])
      .execute();
    this.currentHostUrl = (
      await this.hostController.ensureStarted()
    ).toString();
    const deploymentSet = await this.createDeploymentSet();
    this.startupReconciliation = this.hostController
      .applyDeploymentSet(deploymentSet)
      .then(() => undefined)
      .catch(() => undefined)
      .finally(() => {
        this.startupReconciliation = null;
      });
  }

  public async createDeploymentSet(): Promise<HostDeploymentSet> {
    const rows = await this.query()
      .selectFrom('hubApps')
      .selectAll()
      .orderBy('id', 'asc')
      .execute<Row>();
    const specs: HostDeploymentSpec[] = [];
    for (const row of rows) {
      const app = decodeApp(row);
      const deployment = await this.currentDeployment(app);
      if (!deployment) continue;
      specs.push(await this.createDeploymentSpec(app, deployment));
    }
    this.revision += 1;
    return { revision: this.revision, deployments: specs };
  }

  private async createDeploymentSpec(
    app: HubAppRecord,
    deployment: HubDeploymentRecord,
    desiredState: 'running' | 'stopped' = app.enabled ? 'running' : 'stopped',
  ): Promise<HostDeploymentSpec> {
    const release = await this.getRelease(app.id, deployment.releaseId);
    return {
      // Host deployment identity is stable per App. Hub deployment IDs are
      // immutable operation-history identities and must not replace it.
      id: app.id,
      appId: app.id,
      artifact: {
        key: release.artifactKey,
        appId: app.id,
        version: release.version,
        checksum: release.checksum,
      },
      desiredState,
      backend: app.backend,
      activation: app.startupMode,
      basePath: app.basePath,
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
    await this.startupReconciliation;
    await Promise.allSettled(this.locks.values());
    await this.hostController.shutdown();
    if (this.ownsHostController) AppHostSupervisor.resetInstance();
    this.currentHostUrl = null;
  }

  private query(): DatabaseConnection['query'] {
    return this.options.database.connection().query;
  }

  private async detail(app: HubAppRecord): Promise<HubAppDetail> {
    const deployments = await this.listDeployments(app.id);
    const current = app.currentDeploymentId
      ? (deployments.find((item) => item.id === app.currentDeploymentId) ??
        null)
      : null;
    const runtime = await this.runtimeStatus(app.id);
    return {
      app,
      deployment: {
        desiredReleaseId: current?.releaseId ?? null,
        observedReleaseId: current?.releaseId ?? null,
        desiredState: app.enabled ? 'running' : 'stopped',
        observedState: runtime.state,
        activation: app.startupMode,
        basePath: app.basePath,
        config: current?.config ?? { mode: 'file' },
        error: runtime.error,
        updatedAt: current?.finishedAt ?? app.updatedAt,
      },
      deployments,
      runtime,
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

  public async listDeployments(
    appId: string,
  ): Promise<readonly HubDeploymentRecord[]> {
    await this.requireApp(appId);
    const rows = await this.query()
      .selectFrom('hubAppDeployments')
      .selectAll()
      .where('appId', '=', appId)
      .orderBy('createdAt', 'desc')
      .execute<Row>();
    return rows.map(decodeDeployment);
  }

  public async getDeployment(
    appId: string,
    deploymentId: string,
  ): Promise<HubDeploymentRecord> {
    const row = await this.query()
      .selectFrom('hubAppDeployments')
      .selectAll()
      .where('appId', '=', appId)
      .where('id', '=', deploymentId)
      .executeTakeFirst<Row>();
    if (!row) {
      throw new HubError('Deployment not found.', 'DEPLOYMENT_NOT_FOUND', 404);
    }
    return decodeDeployment(row);
  }

  private async updateDeployment(
    deploymentId: string,
    values: Partial<HubDeploymentRecord>,
  ): Promise<void> {
    await this.query()
      .updateTable('hubAppDeployments')
      .set(encodePartialDeployment(values))
      .where('id', '=', deploymentId)
      .execute();
  }

  private async updateApp(
    appId: string,
    values: Partial<HubAppRecord>,
  ): Promise<void> {
    await this.query()
      .updateTable('hubApps')
      .set({ ...values, updatedAt: new Date() })
      .where('id', '=', appId)
      .execute();
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

  private async currentDeployment(
    app: HubAppRecord,
  ): Promise<HubDeploymentRecord | null> {
    return app.currentDeploymentId
      ? await this.getDeployment(app.id, app.currentDeploymentId)
      : null;
  }

  private async runtimeStatus(appId: string): Promise<HubRuntimeStatus> {
    try {
      const status = await this.hostStatus();
      const item = status.deployments.find(
        (candidate) => candidate.appId === appId,
      );
      if (!item)
        return {
          hostAvailable: true,
          state: 'stopped',
          version: null,
          startedAt: null,
          lastAccessedAt: null,
          activeRequests: 0,
          hostRevision: status.reconciledRevision,
          error: null,
        };
      return {
        hostAvailable: true,
        state: item.observedState,
        version: item.app?.desiredVersion ?? null,
        startedAt: item.app?.createdAt ?? null,
        lastAccessedAt: item.app?.lastAccessedAt ?? null,
        activeRequests: item.app?.activeRequests ?? 0,
        hostRevision: item.revision,
        error: item.error ?? item.app?.lastError ?? null,
      };
    } catch (error) {
      return {
        hostAvailable: false,
        state: 'unknown',
        version: null,
        startedAt: null,
        lastAccessedAt: null,
        activeRequests: 0,
        hostRevision: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async createDeploymentRecord(
    app: HubAppRecord,
    release: HubReleaseRecord,
    kind: 'deploy' | 'rollback',
    rollbackTargetDeploymentId: string | null,
    configInput?: SaveHubConfigInput,
  ): Promise<HubDeploymentRecord> {
    const id = randomUUID();
    const config = await this.prepareDeploymentConfig(
      app,
      release,
      id,
      configInput,
    );
    const deployment: HubDeploymentRecord = {
      id,
      appId: app.id,
      releaseId: release.id,
      kind,
      rollbackTargetDeploymentId,
      previousDeploymentId: app.currentDeploymentId,
      status: 'queued',
      phase: 'queued',
      config,
      cacheHit: null,
      hostRevision: null,
      error: null,
      createdAt: new Date(),
      startedAt: null,
      finishedAt: null,
    };
    await this.query()
      .insertInto('hubAppDeployments')
      .values(encodeDeployment(deployment))
      .execute();
    return deployment;
  }

  private async prepareDeploymentConfig(
    app: HubAppRecord,
    release: HubReleaseRecord,
    deploymentId: string,
    input?: SaveHubConfigInput,
  ): Promise<HubDeploymentRecord['config']> {
    const mode = input?.mode ?? 'file';
    assertConfigMode(mode);
    if (mode === 'external') return { mode };
    let content = input?.content;
    if (content === undefined && app.currentDeploymentId) {
      const current = await this.getDeployment(app.id, app.currentDeploymentId);
      if (current.config.mode === 'file') {
        try {
          content = await readFile(this.configPath(current), 'utf8');
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
      }
    }
    content ??= release.configTemplate ?? '';
    validateYamlConfig(content);
    const configPath = path.join(
      this.options.config.host.volumesDir,
      app.id,
      'configs',
      `${deploymentId}.yml`,
    );
    await writeTextAtomic(configPath, content);
    return { mode: 'file', path: configPath };
  }

  private async configInputFromDeployment(
    deployment: HubDeploymentRecord,
  ): Promise<SaveHubConfigInput> {
    if (deployment.config.mode === 'external') return { mode: 'external' };
    return {
      mode: 'file',
      content: await readFile(this.configPath(deployment), 'utf8'),
    };
  }

  private schedule(appId: string, deploymentId: string): void {
    void this.withLock(appId, () => this.runDeployment(deploymentId)).catch(
      () => undefined,
    );
  }

  private async getDeploymentById(
    deploymentId: string,
  ): Promise<HubDeploymentRecord> {
    const row = await this.query()
      .selectFrom('hubAppDeployments')
      .selectAll()
      .where('id', '=', deploymentId)
      .executeTakeFirst<Row>();
    if (!row)
      throw new HubError('Deployment not found.', 'DEPLOYMENT_NOT_FOUND', 404);
    return decodeDeployment(row);
  }

  private async runDeployment(deploymentId: string): Promise<void> {
    const deployment = await this.getDeploymentById(deploymentId);
    const app = await this.requireApp(deployment.appId);
    await this.updateDeployment(deploymentId, {
      status: 'deploying',
      phase: 'resolving',
      startedAt: new Date(),
      error: null,
    });
    try {
      await this.updateDeployment(deploymentId, { phase: 'starting' });
      const hostStatus = await this.hostController.applyDeployment(
        await this.createDeploymentSpec(
          { ...app, enabled: true },
          deployment,
          'running',
        ),
      );
      const observed = hostStatus.deployments.find(
        (candidate) => candidate.appId === app.id,
      );
      if (!observed || observed.observedState === 'failed')
        throw new Error(
          observed?.error ?? 'Host did not report deployment status.',
        );
      const finishedAt = new Date();
      await this.options.database.transaction(async (connection) => {
        await connection.query
          .updateTable('hubAppDeployments')
          .set({
            status: 'succeeded',
            phase: 'completed',
            hostRevision: observed.revision,
            finishedAt,
          })
          .where('id', '=', deploymentId)
          .execute();
        await connection.query
          .updateTable('hubApps')
          .set({
            currentDeploymentId: deploymentId,
            enabled: true,
            updatedAt: finishedAt,
          })
          .where('id', '=', app.id)
          .execute();
      });
    } catch (error) {
      await this.updateDeployment(deploymentId, {
        status: 'failed',
        phase: 'completed',
        error: error instanceof Error ? error.message : String(error),
        finishedAt: new Date(),
      });
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
  readonly manifest: Record<string, unknown>;
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
    ) as Record<string, unknown>;
    const appMetadata = isRecord(packageMetadata.app)
      ? packageMetadata.app
      : undefined;
    const rawVersion = appMetadata?.version ?? packageMetadata.version;
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
    return { version: rawVersion, configTemplate, manifest: packageMetadata };
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
    currentDeploymentId: nullableString(row.currentDeploymentId),
    enabled: Boolean(row.enabled),
    basePath: String(row.basePath),
    backend: 'in-process',
    startupMode: row.startupMode === 'lazy' ? 'lazy' : 'eager',
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
    manifest: decodeNullableRecord(row.manifest),
    createdAt: decodeDate(row.createdAt),
  };
}

function decodeDeployment(row: Row): HubDeploymentRecord {
  return {
    id: String(row.id),
    appId: String(row.appId),
    releaseId: String(row.releaseId),
    kind: row.kind === 'rollback' ? 'rollback' : 'deploy',
    rollbackTargetDeploymentId: nullableString(row.rollbackTargetDeploymentId),
    previousDeploymentId: nullableString(row.previousDeploymentId),
    status: String(row.status) as HubDeploymentRecord['status'],
    phase: String(row.phase) as HubDeploymentRecord['phase'],
    config: decodeConfigBinding(row.config),
    cacheHit: row.cacheHit == null ? null : Boolean(row.cacheHit),
    hostRevision: row.hostRevision == null ? null : Number(row.hostRevision),
    error: nullableString(row.error),
    createdAt: decodeDate(row.createdAt),
    startedAt: row.startedAt == null ? null : decodeDate(row.startedAt),
    finishedAt: row.finishedAt == null ? null : decodeDate(row.finishedAt),
  };
}

function encodeRelease(release: HubReleaseRecord): Row {
  return {
    ...release,
    manifest: release.manifest ? JSON.stringify(release.manifest) : null,
  };
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

function decodeNullableRecord(value: unknown): Record<string, unknown> | null {
  if (value == null) return null;
  const decoded = decodeJson(value);
  return isRecord(decoded) ? decoded : null;
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
