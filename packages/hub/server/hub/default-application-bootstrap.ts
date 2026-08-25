import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { DatabaseConnection } from '@nocobase/app-database';

import {
  HubManagementStore,
  type ManagedApplication,
} from './management-store.ts';
import { ReleaseUploadService } from './release-upload-service.ts';
import {
  HubRepositoryService,
  type HubRepositoryStatus,
} from './repository-service.ts';
import { RuntimeSecretService } from './runtime-secret-service.ts';
import { HubDomainError, HubStore } from './store.ts';
import type { HubDeployment, HubRelease } from './types.ts';
import { LocalHostAdapter } from './local-host-adapter.ts';

export const DEFAULT_BOOTSTRAP_SETTING_KEY =
  'setup.defaultApplication.bootstrap';
export const DEFAULT_APPLICATION_ID = 'system-default-application';
export const DEFAULT_APPLICATION_ACTOR_ID = 'system';
const MAX_AUTOMATIC_ATTEMPTS = 3;
const AUTOMATIC_RETRY_DELAY_MS = 25;

export type DefaultApplicationBootstrapStatus =
  'preparing' | 'ready' | 'failed';

export interface DefaultApplicationBootstrapState {
  readonly schemaVersion: 1;
  readonly status: DefaultApplicationBootstrapStatus;
  readonly step:
    | 'preparing'
    | 'repository'
    | 'application'
    | 'release'
    | 'deployment'
    | 'ready'
    | 'failed';
  readonly operationId: string;
  readonly applicationId: string | null;
  readonly releaseId: string | null;
  readonly deploymentId: string | null;
  readonly resourceDigest: string | null;
  readonly attempt: number;
  readonly errorCode: string | null;
  readonly retryable: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface DefaultApplicationStatus {
  readonly status: DefaultApplicationBootstrapStatus;
  readonly retryable: boolean;
  readonly errorCode: string | null;
}

export interface DefaultApplicationBootstrapOptions {
  readonly connection: DatabaseConnection;
  readonly store: HubStore;
  readonly managementStore: HubManagementStore;
  readonly repository: HubRepositoryService;
  readonly runtimeSecrets: RuntimeSecretService;
  readonly releaseUploads: ReleaseUploadService;
  readonly host: LocalHostAdapter;
  readonly resourcesDirectory: string;
  readonly scheduleDeployment: (deployment: HubDeployment) => Promise<void>;
  readonly appName?: string;
}

interface DefaultResourceMetadata {
  readonly schemaVersion: 1;
  readonly resourceDigest: string;
  readonly application: {
    readonly slug: string;
    readonly name: string;
    readonly description: string | null;
  };
  readonly release: {
    readonly version: string;
    readonly sourceCommit: string;
    readonly checksum: string;
    readonly sizeBytes: number;
    readonly archiveChecksum: string;
    readonly archiveSizeBytes: number;
    readonly archiveFormat: 'tar.gz';
    readonly manifest: Record<string, unknown>;
  };
}

/**
 * Coordinates the system default APP as a resumable saga. The durable state and
 * resource uniqueness constraints let another process resume and converge the
 * same operation after a crash.
 */
export class DefaultApplicationBootstrap {
  private readonly options: DefaultApplicationBootstrapOptions;
  private tail: Promise<DefaultApplicationStatus> = Promise.resolve({
    status: 'preparing',
    retryable: false,
    errorCode: null,
  });

  constructor(options: DefaultApplicationBootstrapOptions) {
    this.options = {
      ...options,
      resourcesDirectory: path.resolve(options.resourcesDirectory),
    };
  }

  async status(): Promise<DefaultApplicationStatus> {
    const state = await this.readState();
    if (state) {
      return projectStatus(state);
    }
    const application =
      await this.options.managementStore.getDefaultApplication();
    if (application?.activeReleaseId) {
      const deployment = await this.findSuccessfulDeployment(application.id);
      if (deployment) {
        return { status: 'ready', retryable: false, errorCode: null };
      }
    }
    return { status: 'preparing', retryable: false, errorCode: null };
  }

  /** Starts or resumes bootstrap. Failures are persisted and returned as status. */
  ensure(): Promise<DefaultApplicationStatus> {
    this.tail = this.tail.then(async () => {
      let status = await this.run(false);
      for (
        let attempt = 1;
        attempt < MAX_AUTOMATIC_ATTEMPTS &&
        status.status === 'failed' &&
        status.retryable;
        attempt += 1
      ) {
        await delay(AUTOMATIC_RETRY_DELAY_MS * 2 ** (attempt - 1));
        status = await this.run(false);
      }
      return status;
    });
    return this.tail;
  }

  /** Explicitly retries a retryable failed bootstrap. */
  retry(): Promise<DefaultApplicationStatus> {
    this.tail = this.tail.then(() => this.run(true));
    return this.tail;
  }

  private async run(forceRetry: boolean): Promise<DefaultApplicationStatus> {
    const current = await this.readState();
    if (current?.status === 'ready') return projectStatus(current);

    let state: DefaultApplicationBootstrapState | undefined;
    let operationId = current?.operationId ?? 'default-bootstrap-resources';
    try {
      const metadata = await this.readMetadata();
      if (
        current?.status === 'failed' &&
        !current.retryable &&
        !forceRetry &&
        current.resourceDigest === metadata.resourceDigest
      ) {
        return projectStatus(current);
      }
      operationId =
        current?.operationId ?? `default-bootstrap-${metadata.resourceDigest}`;
      state = await this.claimState({
        current,
        operationId,
        resourceDigest: metadata.resourceDigest,
        forceRetry,
      });
      const application = await this.ensureApplication(state, metadata);
      const release = await this.ensureRelease(application.id, metadata, state);
      const deployment = await this.ensureDeployment(
        application.id,
        release,
        state,
      );
      if (deployment.status !== 'succeeded') {
        await this.options.scheduleDeployment(deployment);
      }
      const completed = await this.options.store.getDeployment(deployment.id);
      if (!completed || completed.status !== 'succeeded') {
        throw new HubDomainError(
          completed?.failureCode ?? 'RUNTIME_READINESS_FAILED',
          completed?.failureMessage ?? 'Default application deployment failed.',
          { status: 503, retryable: true },
        );
      }
      const ready = await this.writeState({
        ...state,
        status: 'ready',
        step: 'ready',
        applicationId: application.id,
        releaseId: release.id,
        deploymentId: deployment.id,
        errorCode: null,
        retryable: false,
      });
      await this.appendBootstrapAudit(
        'defaultApplication.bootstrapped',
        'success',
        {
          applicationId: application.id,
          releaseId: release.id,
          deploymentId: deployment.id,
          operationId,
        },
      );
      return projectStatus(ready);
    } catch (error) {
      if (
        !state &&
        current?.status === 'failed' &&
        !current.retryable &&
        !forceRetry
      ) {
        return projectStatus(current);
      }
      const domain = toBootstrapError(error);
      state ??= await this.claimState({
        current,
        operationId,
        resourceDigest: current?.resourceDigest ?? null,
        forceRetry,
      });
      const failed = await this.writeState({
        ...state,
        status: 'failed',
        step: 'failed',
        errorCode: publicBootstrapErrorCode(domain.code),
        retryable: domain.retryable,
      });
      await this.appendBootstrapAudit(
        'defaultApplication.bootstrapFailed',
        'failure',
        { operationId, errorCode: failed.errorCode },
      ).catch(() => undefined);
      return projectStatus(failed);
    }
  }

  private async ensureApplication(
    state: DefaultApplicationBootstrapState,
    metadata: DefaultResourceMetadata,
  ): Promise<ManagedApplication> {
    const existing = await this.options.managementStore.getDefaultApplication();
    const applicationId =
      existing?.id ?? state.applicationId ?? DEFAULT_APPLICATION_ID;
    const repository =
      await this.options.managementStore.getRepository(applicationId);
    let repositoryStatus: HubRepositoryStatus | undefined;
    if (!repository) {
      try {
        repositoryStatus = await this.options.repository.create(applicationId);
      } catch (error) {
        repositoryStatus = await this.options.repository
          .getStatus(applicationId)
          .catch(() => {
            throw error;
          });
      }
    }
    if (existing) {
      if (!repository && repositoryStatus) {
        await this.options.managementStore.createRepository(applicationId, {
          provider: 'hub',
          defaultBranch: repositoryStatus.defaultBranch,
          headCommit: repositoryStatus.headCommit,
          status: repositoryStatus.status,
          initialCommit: repositoryStatus.headCommit,
        });
      }
      await this.options.runtimeSecrets.ensureInitial(applicationId);
      await this.writeState({
        ...state,
        step: 'application',
        applicationId: existing.id,
      });
      return existing;
    }
    try {
      await this.options.connection.transaction(async (connection) => {
        const store = new HubStore(connection);
        const managementStore = new HubManagementStore(connection, {
          roles: this.options.managementStore.listRoles(),
        });
        const created = await store.createApplication(
          {
            slug: metadata.application.slug,
            name: metadata.application.name,
            description: metadata.application.description,
          },
          DEFAULT_APPLICATION_ACTOR_ID,
          { id: applicationId, isDefault: true },
        );
        if (!(await managementStore.getRepository(applicationId))) {
          await managementStore.createRepository(applicationId, {
            provider: 'hub',
            defaultBranch: repositoryStatus?.defaultBranch ?? 'main',
            headCommit: repositoryStatus?.headCommit ?? null,
            status: repositoryStatus?.status ?? 'ready',
            initialCommit: repositoryStatus?.headCommit ?? null,
          });
        }
        await this.options.runtimeSecrets
          .withConnection(connection)
          .ensureInitial(applicationId);
        await managementStore.appendAuditLog({
          actorId: DEFAULT_APPLICATION_ACTOR_ID,
          applicationId,
          action: 'application.created',
          resource: 'application',
          resourceId: applicationId,
          result: 'success',
          source: 'system',
          details: { slug: created.slug, isDefault: true },
        });
      });
    } catch (error) {
      const raced = await this.options.managementStore.getDefaultApplication();
      if (!raced) throw error;
    }
    const application =
      await this.options.managementStore.getDefaultApplication();
    if (!application) {
      throw new HubDomainError(
        'DEFAULT_APP_CREATION_INCOMPLETE',
        'The default application could not be created completely.',
        { status: 500, retryable: true },
      );
    }
    await this.writeState({
      ...state,
      step: 'application',
      applicationId: application.id,
    });
    return application;
  }

  private async ensureRelease(
    applicationId: string,
    metadata: DefaultResourceMetadata,
    state: DefaultApplicationBootstrapState,
  ): Promise<HubRelease> {
    const existingPage = await this.options.store.listReleases(applicationId, {
      limit: 100,
    });
    const existing = existingPage.items.find(
      (release) =>
        release.version === metadata.release.version &&
        release.checksum === metadata.release.checksum &&
        release.sourceCommit === metadata.release.sourceCommit,
    );
    if (existing) {
      await this.writeState({
        ...state,
        step: 'release',
        releaseId: existing.id,
      });
      return existing;
    }
    const archive = new Uint8Array(
      await readFile(
        path.join(this.options.resourcesDirectory, 'initial-release.tar.gz'),
      ),
    );
    const actor = {
      userId: DEFAULT_APPLICATION_ACTOR_ID,
      credentialId: null,
      isAdmin: true,
    } as const;
    const upload = await this.options.releaseUploads.create(
      applicationId,
      {
        version: metadata.release.version,
        sourceCommit: metadata.release.sourceCommit,
        checksum: metadata.release.checksum,
        sizeBytes: metadata.release.sizeBytes,
        archiveChecksum: metadata.release.archiveChecksum,
        archiveSizeBytes: metadata.release.archiveSizeBytes,
        archiveFormat: metadata.release.archiveFormat,
        manifest: metadata.release.manifest,
      },
      actor,
    );
    await this.options.releaseUploads.putContent(upload.id, actor, archive);
    await this.options.releaseUploads.startCompletion(upload.id, actor);
    const completed = await this.options.releaseUploads.waitForCompletion(
      upload.id,
    );
    if (completed.status !== 'completed' || !completed.release) {
      throw new HubDomainError(
        completed.failure?.code ?? 'RELEASE_VERIFICATION_FAILED',
        completed.failure?.message ??
          'The default release could not be verified.',
        { status: 422, retryable: false },
      );
    }
    const release = await this.options.store.getRelease(completed.release.id);
    if (!release) {
      throw new HubDomainError(
        'DEFAULT_RELEASE_NOT_FOUND',
        'The verified default release could not be loaded.',
        { status: 500, retryable: true },
      );
    }
    await this.writeState({ ...state, step: 'release', releaseId: release.id });
    return release;
  }

  private async ensureDeployment(
    applicationId: string,
    release: HubRelease,
    state: DefaultApplicationBootstrapState,
  ): Promise<HubDeployment> {
    const deployments = await this.options.store.listDeployments({
      applicationId,
      limit: 100,
    });
    const key = `${state.operationId}:deployment:${state.attempt}`;
    const existing = deployments.items.find(
      (deployment) =>
        deployment.idempotencyKey === key &&
        deployment.targetReleaseId === release.id,
    );
    if (existing) {
      await this.writeState({
        ...state,
        step: 'deployment',
        deploymentId: existing.id,
      });
      return existing;
    }
    const created = await this.options.store.createDeployment(
      applicationId,
      {
        targetReleaseId: release.id,
        type: 'deploy',
        idempotencyKey: key,
      },
      DEFAULT_APPLICATION_ACTOR_ID,
    );
    await this.writeState({
      ...state,
      step: 'deployment',
      deploymentId: created.deployment.id,
    });
    return created.deployment;
  }

  private async readMetadata(): Promise<DefaultResourceMetadata> {
    let value: Partial<DefaultResourceMetadata>;
    try {
      value = JSON.parse(
        await readFile(
          path.join(this.options.resourcesDirectory, 'metadata.json'),
          'utf8',
        ),
      ) as Partial<DefaultResourceMetadata>;
    } catch (error) {
      throw new HubDomainError(
        'DEFAULT_APP_RESOURCES_INVALID',
        'Default application resources are invalid.',
        { status: 500, retryable: false, cause: error },
      );
    }
    if (
      value.schemaVersion !== 1 ||
      typeof value.resourceDigest !== 'string' ||
      value.application?.slug !== 'default' ||
      typeof value.application.name !== 'string' ||
      value.release?.archiveFormat !== 'tar.gz' ||
      typeof value.release.version !== 'string' ||
      typeof value.release.sourceCommit !== 'string' ||
      typeof value.release.checksum !== 'string' ||
      typeof value.release.sizeBytes !== 'number' ||
      typeof value.release.archiveChecksum !== 'string' ||
      typeof value.release.archiveSizeBytes !== 'number' ||
      !value.release.manifest ||
      typeof value.release.manifest !== 'object' ||
      Array.isArray(value.release.manifest)
    ) {
      throw new HubDomainError(
        'DEFAULT_APP_RESOURCES_INVALID',
        'Default application resources are invalid.',
        { status: 500, retryable: false },
      );
    }
    return value as DefaultResourceMetadata;
  }

  private async readState(): Promise<
    DefaultApplicationBootstrapState | undefined
  > {
    const row = await this.options.connection.query
      .selectFrom('hubSettings')
      .select(['value'])
      .where('key', '=', DEFAULT_BOOTSTRAP_SETTING_KEY)
      .executeTakeFirst();
    if (!row?.value) return undefined;
    try {
      const value = (
        typeof row.value === 'string' ? JSON.parse(row.value) : row.value
      ) as DefaultApplicationBootstrapState;
      if (value.schemaVersion !== 1 || !value.operationId) return undefined;
      return value;
    } catch {
      return undefined;
    }
  }

  private async claimState(input: {
    current: DefaultApplicationBootstrapState | undefined;
    operationId: string;
    resourceDigest: string | null;
    forceRetry: boolean;
  }): Promise<DefaultApplicationBootstrapState> {
    const now = new Date().toISOString();
    const state: DefaultApplicationBootstrapState = {
      schemaVersion: 1,
      status: 'preparing',
      step:
        input.current?.step === 'failed'
          ? 'preparing'
          : (input.current?.step ?? 'preparing'),
      operationId: input.operationId,
      applicationId: input.current?.applicationId ?? null,
      releaseId: input.current?.releaseId ?? null,
      deploymentId: input.current?.deploymentId ?? null,
      resourceDigest: input.resourceDigest,
      attempt:
        input.current?.status === 'failed'
          ? input.current.attempt + 1
          : (input.current?.attempt ?? 1),
      errorCode: null,
      retryable: false,
      createdAt: input.current?.createdAt ?? now,
      updatedAt: now,
    };
    return this.writeState(state);
  }

  private async writeState(
    state: Omit<DefaultApplicationBootstrapState, 'updatedAt'> & {
      updatedAt?: string;
    },
  ): Promise<DefaultApplicationBootstrapState> {
    const next: DefaultApplicationBootstrapState = {
      ...state,
      updatedAt: state.updatedAt ?? new Date().toISOString(),
    };
    const updated = await this.options.connection.query
      .updateTable('hubSettings')
      .set({
        value: JSON.stringify(next),
        updatedAt: new Date(next.updatedAt),
      })
      .where('key', '=', DEFAULT_BOOTSTRAP_SETTING_KEY)
      .execute();
    if (updated.updatedCount !== 1) {
      try {
        await this.options.connection.query
          .insertInto('hubSettings')
          .values({
            key: DEFAULT_BOOTSTRAP_SETTING_KEY,
            value: JSON.stringify(next),
            updatedAt: new Date(next.updatedAt),
          })
          .execute();
      } catch {
        await this.options.connection.query
          .updateTable('hubSettings')
          .set({
            value: JSON.stringify(next),
            updatedAt: new Date(next.updatedAt),
          })
          .where('key', '=', DEFAULT_BOOTSTRAP_SETTING_KEY)
          .execute();
      }
    }
    return next;
  }

  private async findSuccessfulDeployment(
    applicationId: string,
  ): Promise<HubDeployment | undefined> {
    const deployments = await this.options.store.listDeployments({
      applicationId,
      statuses: ['succeeded'],
      limit: 1,
    });
    return deployments.items[0];
  }

  private async appendBootstrapAudit(
    action:
      'defaultApplication.bootstrapped' | 'defaultApplication.bootstrapFailed',
    result: 'success' | 'failure',
    details: Record<string, unknown>,
  ): Promise<void> {
    await this.options.managementStore.appendAuditLog({
      actorId: DEFAULT_APPLICATION_ACTOR_ID,
      action,
      resource: 'hub',
      resourceId: null,
      result,
      source: 'system',
      details,
    });
  }
}

function projectStatus(
  state: DefaultApplicationBootstrapState,
): DefaultApplicationStatus {
  return {
    status: state.status,
    retryable: state.status === 'failed' && state.retryable,
    errorCode: state.status === 'failed' ? state.errorCode : null,
  };
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function toBootstrapError(error: unknown): HubDomainError {
  if (error instanceof HubDomainError) return error;
  return new HubDomainError(
    'DEFAULT_APP_BOOTSTRAP_FAILED',
    'Default application bootstrap failed.',
    { status: 500, retryable: true, cause: error },
  );
}

function publicBootstrapErrorCode(code: string): string {
  if (code === 'APP_READINESS_FAILED') return 'RUNTIME_READINESS_FAILED';
  const allowed = new Set([
    'DEFAULT_APP_RESOURCES_INVALID',
    'REPOSITORY_INIT_FAILED',
    'SOURCE_STORAGE_UNAVAILABLE',
    'RELEASE_STORAGE_UNAVAILABLE',
    'RELEASE_VERIFICATION_FAILED',
    'RELEASE_MANIFEST_INVALID',
    'RELEASE_CHECKSUM_MISMATCH',
    'RUNTIME_READINESS_FAILED',
    'HOST_UNAVAILABLE',
    'DEPLOYMENT_IN_PROGRESS',
  ]);
  return allowed.has(code) ? code : 'DEFAULT_APP_BOOTSTRAP_FAILED';
}
