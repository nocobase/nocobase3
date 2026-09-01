import { createHash, randomUUID } from 'node:crypto';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { AppConfigSchemaDocument } from '@nocobase/app-server/config';
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
import { Ajv, type ErrorObject } from 'ajv';
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
  HubDeploymentRecord,
  HubObservedState,
  HubReleaseRecord,
  HubService,
  SaveHubConfigInput,
} from '../tokens.js';

const MAX_ARTIFACT_SIZE = 256 * 1024 * 1024;
const APP_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
const RELEASE_VERSION_PATTERN = /^[0-9A-Za-z][0-9A-Za-z._+-]{0,254}$/;
const CONFIG_SCHEMA_PATH = 'dist/config-schema.json';

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
      activation: 'lazy',
      config: { provider: 'file' },
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
    const version = input.version.trim();
    if (!RELEASE_VERSION_PATTERN.test(version)) {
      throw new HubError(
        'Release version must use package-version characters only.',
        'INVALID_VERSION',
        422,
      );
    }
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
    const metadata = await inspectArtifact(input.bytes, version);
    const id = randomUUID();
    const artifactKey = `${appId}/${id}.tar.gz`;
    const release: HubReleaseRecord = {
      id,
      appId,
      version,
      artifactKey,
      checksum: sha256(input.bytes),
      size: input.bytes.byteLength,
      configSchema: metadata.schema,
      configSchemaFormatVersion: metadata.schema.formatVersion,
      configSchemaDigest: metadata.schemaDigest,
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
    const configPath = this.configPath(deployment);
    try {
      const content = parseConfigDocument(
        configPath,
        await readFile(configPath, 'utf8'),
      );
      if (!isRecord(content)) {
        throw new HubError(
          'App configuration must be a YAML object.',
          'INVALID_CONFIG_FILE',
          422,
        );
      }
      return {
        content,
        releaseId: deployment.desiredReleaseId ?? deployment.observedReleaseId,
        path: configPath,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return {
          content: {},
          releaseId:
            deployment.desiredReleaseId ?? deployment.observedReleaseId,
          path: configPath,
        };
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
      const release = await this.getRelease(appId, input.releaseId);
      validateConfig(input.content, release.configSchema);
      const configPath = this.configPath(deployment);
      await writeConfigAtomic(configPath, input.content);
      return {
        content: input.content,
        releaseId: release.id,
        path: configPath,
      };
    });
  }

  public async deploy(
    appId: string,
    input: DeployHubAppInput,
  ): Promise<HubAppDetail> {
    return await this.withLock(appId, async () => {
      const release = await this.getRelease(appId, input.releaseId);
      const deployment = await this.requireDeployment(appId);
      const configPath = this.configPath(deployment);
      const previousConfig = await readOptionalFile(configPath);
      const config = input.config ?? (await this.readConfig(appId)).content;
      validateConfig(config, release.configSchema);
      await writeConfigAtomic(configPath, config);
      await this.updateDeployment(appId, {
        desiredReleaseId: release.id,
        desiredState: 'running',
        observedState: 'pending',
        error: null,
      });

      try {
        const result = await this.hostController.applyDeploymentSet(
          await this.createDeploymentSet(),
        );
        const status = result.status.deployments.find(
          (candidate) => candidate.appId === appId,
        );
        if (!status || status.observedState === 'failed') {
          throw new Error(
            status?.error ?? 'Host did not report deployment status.',
          );
        }
        await this.observe(status);
      } catch (error) {
        await restoreFile(configPath, previousConfig);
        await this.updateDeployment(appId, {
          desiredReleaseId: deployment.desiredReleaseId,
          desiredState: deployment.desiredState,
          observedState: deployment.observedState,
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
        const result = await this.hostController.applyDeploymentSet(
          await this.createDeploymentSet(),
        );
        const status = result.status.deployments.find(
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

  public async restart(appId: string): Promise<HostStatus> {
    const deployment = await this.requireDeployment(appId);
    if (deployment.desiredState !== 'running') {
      throw new HubError(
        'Stopped app cannot be restarted.',
        'APP_STOPPED',
        409,
      );
    }
    return await (
      await this.hostController.getManagementClient()
    ).restartApp(appId);
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
        config: deployment.config,
      });
    }
    this.revision += 1;
    return { revision: this.revision, deployments: specs };
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
    await writeConfigAtomic(this.options.config.host.configPath, document);
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

async function inspectArtifact(
  bytes: Uint8Array,
  expectedVersion: string,
): Promise<{ schema: AppConfigSchemaDocument; schemaDigest: string }> {
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
          normalized === 'package.json' || normalized === CONFIG_SCHEMA_PATH
        );
      },
    });
    const packageMetadata = JSON.parse(
      await readFile(path.join(directory, 'package.json'), 'utf8'),
    ) as { version?: unknown; app?: { version?: unknown } };
    const version = packageMetadata.app?.version ?? packageMetadata.version;
    if (version !== expectedVersion) {
      throw new HubError(
        `Artifact version "${String(version)}" does not match release version "${expectedVersion}".`,
        'ARTIFACT_VERSION_MISMATCH',
        422,
      );
    }
    const schemaBytes = await readFile(
      path.join(directory, CONFIG_SCHEMA_PATH),
    );
    const schema = JSON.parse(schemaBytes.toString('utf8')) as unknown;
    assertSchemaDocument(schema);
    return { schema, schemaDigest: sha256(schemaBytes) };
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

function assertSchemaDocument(
  value: unknown,
): asserts value is AppConfigSchemaDocument {
  if (
    !isRecord(value) ||
    value.formatVersion !== 1 ||
    !Array.isArray(value.configs) ||
    !Array.isArray(value.variants)
  ) {
    throw new HubError(
      'Artifact config schema uses an unsupported format.',
      'INVALID_CONFIG_SCHEMA',
      422,
    );
  }
  for (const entry of value.configs) {
    if (
      !isRecord(entry) ||
      typeof entry.namespace !== 'string' ||
      !isRecord(entry.schema)
    ) {
      throw new HubError(
        'Artifact config schema contains an invalid config entry.',
        'INVALID_CONFIG_SCHEMA',
        422,
      );
    }
  }
}

function validateConfig(
  content: Record<string, unknown>,
  document: AppConfigSchemaDocument,
): void {
  const ajv = new Ajv({
    allErrors: true,
    strictSchema: false,
    useDefaults: false,
  });
  const errors: string[] = [];
  for (const entry of document.configs) {
    const value = content[entry.namespace];
    if (value === undefined) continue;
    const validate = ajv.compile(entry.schema);
    if (!validate(value)) {
      errors.push(...formatAjvErrors(entry.namespace, validate.errors));
    }
  }
  for (const variant of document.variants) {
    const entries = valueAtPath(content, variant.target);
    if (entries === undefined) continue;
    if (!isRecord(entries)) {
      errors.push(`/${variant.target.replaceAll('.', '/')}: must be an object`);
      continue;
    }
    for (const [name, value] of Object.entries(entries)) {
      if (isRecord(value) && value[variant.discriminator] === variant.value) {
        const validate = ajv.compile(variant.schema);
        if (!validate(value)) {
          errors.push(
            ...formatAjvErrors(
              `${variant.target.replaceAll('.', '/')}/${name}`,
              validate.errors,
            ),
          );
        }
      }
    }
  }
  if (errors.length) {
    throw new HubError(
      `Configuration is invalid: ${errors.join('; ')}`,
      'INVALID_CONFIG',
      422,
    );
  }
}

function formatAjvErrors(
  namespace: string,
  errors: readonly ErrorObject[] | null | undefined,
): string[] {
  return (errors ?? []).map(
    (error) =>
      `/${namespace}${error.instancePath}: ${error.message ?? 'invalid value'}`,
  );
}

async function writeConfigAtomic(
  filePath: string,
  content: Record<string, unknown>,
): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temporary = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, serializeConfigDocument(filePath, content), {
      mode: 0o600,
      flag: 'wx',
    });
    await chmod(temporary, 0o600);
    await rename(temporary, filePath);
  } finally {
    await rm(temporary, { force: true });
  }
}

function parseConfigDocument(filePath: string, source: string): unknown {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.json') return JSON.parse(source) as unknown;
  if (extension === '.yml' || extension === '.yaml') return parseYaml(source);
  throw new HubError(
    `Unsupported config file extension "${extension || '(none)'}".`,
    'UNSUPPORTED_CONFIG_FILE',
    422,
  );
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

function valueAtPath(
  content: Record<string, unknown>,
  target: string,
): unknown {
  let current: unknown = content;
  for (const segment of target.split('.')) {
    if (!isRecord(current)) return undefined;
    current = current[segment];
  }
  return current;
}

async function readOptionalFile(filePath: string): Promise<Uint8Array | null> {
  try {
    return await readFile(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

async function restoreFile(
  filePath: string,
  previous: Uint8Array | null,
): Promise<void> {
  if (!previous) {
    await rm(filePath, { force: true });
    return;
  }
  await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  await writeFile(filePath, previous, { mode: 0o600 });
}

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function decodeApp(row: Row): HubAppRecord {
  return {
    id: String(row.id),
    name: String(row.name),
    description: nullableString(row.description),
    createdAt: new Date(String(row.createdAt)),
    updatedAt: new Date(String(row.updatedAt)),
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
    configSchema: decodeJson(row.configSchema) as AppConfigSchemaDocument,
    configSchemaFormatVersion: Number(row.configSchemaFormatVersion),
    configSchemaDigest: String(row.configSchemaDigest),
    createdAt: new Date(String(row.createdAt)),
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
    config: decodeJson(row.config) as HubDeploymentRecord['config'],
    error: nullableString(row.error),
    createdAt: new Date(String(row.createdAt)),
    updatedAt: new Date(String(row.updatedAt)),
  };
}

function encodeRelease(release: HubReleaseRecord): Row {
  return { ...release, configSchema: JSON.stringify(release.configSchema) };
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
