import type { DatabaseConnection } from '@nocobase/app-database';

import {
  HubManagementStore,
  type ManagedApplication,
} from './management-store.ts';
import type { ReleaseUploadService } from './release-upload-service.ts';
import { RuntimeSecretService } from './runtime-secret-service.ts';
import { HubDomainError, HubStore } from './store.ts';
import type { HubDeployment } from './types.ts';
import type { LocalHostAdapter } from './local-host-adapter.ts';

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
    'preparing' | 'application' | 'release' | 'deployment' | 'ready' | 'failed';
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
  readonly runtimeSecrets: RuntimeSecretService;
  readonly releaseUploads: ReleaseUploadService;
  readonly host: LocalHostAdapter;
  readonly resourcesDirectory: string;
  readonly scheduleDeployment: (deployment: HubDeployment) => Promise<void>;
  readonly appName?: string;
}

/**
 * Creates the empty system default APP and its Runtime Secret as a resumable
 * saga. Releases and Deployments are created only after a developer publishes
 * a local application build to Hub.
 */
export class DefaultApplicationBootstrap {
  private readonly options: DefaultApplicationBootstrapOptions;
  private tail: Promise<DefaultApplicationStatus> = Promise.resolve({
    status: 'preparing',
    retryable: false,
    errorCode: null,
  });

  constructor(options: DefaultApplicationBootstrapOptions) {
    this.options = options;
  }

  async status(): Promise<DefaultApplicationStatus> {
    const state = await this.readState();
    if (state) {
      return projectStatus(state);
    }
    const application =
      await this.options.managementStore.getDefaultApplication();
    if (application) {
      return { status: 'ready', retryable: false, errorCode: null };
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
    const operationId =
      current?.operationId ?? 'default-bootstrap-empty-application';
    try {
      if (current?.status === 'failed' && !current.retryable && !forceRetry) {
        return projectStatus(current);
      }
      state = await this.claimState({
        current,
        operationId,
        resourceDigest: null,
        forceRetry,
      });
      const application = await this.ensureApplication(state);
      const ready = await this.writeState({
        ...state,
        status: 'ready',
        step: 'ready',
        applicationId: application.id,
        releaseId: null,
        deploymentId: null,
        resourceDigest: null,
        errorCode: null,
        retryable: false,
      });
      await this.appendBootstrapAudit(
        'defaultApplication.bootstrapped',
        'success',
        {
          applicationId: application.id,
          releaseId: null,
          deploymentId: null,
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
  ): Promise<ManagedApplication> {
    const existing = await this.options.managementStore.getDefaultApplication();
    const applicationId =
      existing?.id ?? state.applicationId ?? DEFAULT_APPLICATION_ID;
    if (existing) {
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
            slug: 'default',
            name: 'Default application',
            description: null,
          },
          DEFAULT_APPLICATION_ACTOR_ID,
          { id: applicationId, isDefault: true },
        );
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
