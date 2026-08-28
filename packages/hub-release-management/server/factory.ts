import path from 'node:path';
import type { DatabaseManager } from '@nocobase/app-database';
import { AppHostClient } from './app-host-client.js';
import { JsonManagedAppStore } from './app-store.js';
import {
  createDeploymentTokenAuthorizer,
  createNativeReleaseAuthorizer,
  createNocoBaseReleaseAuthorizer,
  unavailableReleaseAuthorizer,
  type ReleaseNativeSessionReader,
  type ReleaseAuthorizer,
} from './authorization.js';
import {
  JsonDeploymentStore,
  type DeploymentStore,
} from './deployment-store.js';
import { ReleaseManagementError } from './errors.js';
import { NocoBaseDeploymentStore } from './nocobase-deployment-store.js';
import { JsonAppLifecycleOperationStore } from './lifecycle-operation-store.js';
import { ReleaseManagementService } from './service.js';
import {
  JsonReleaseWorkflowStore,
  StoreReleaseNotificationSink,
} from './workflow-store.js';

export interface ReleaseManagementConfig {
  appHostUrl: string;
  appHostControlToken?: string;
  appHostUploadTimeoutMs?: number;
  nativeAuth?: ReleaseNativeSessionReader;
  database?: Pick<DatabaseManager, 'query'>;
  adminEmails?: string[];
  nocoBaseApiUrl?: string;
  auditAccessToken?: string;
  auditRole?: string;
  auditCollection?: string;
  storePath: string;
  appStorePath?: string;
  workflowStorePath?: string;
  allowedRoles?: string[];
  approvalRequired?: boolean;
  rollbackEnabled?: boolean;
  deployToken?: string;
}

export interface ReleaseManagementComponents {
  service: ReleaseManagementService;
  authorize: ReleaseAuthorizer;
  authorizeArtifactUpload: ReleaseAuthorizer;
  approvalRequired: boolean;
  rollbackEnabled: boolean;
}

export function createReleaseManagement(
  config: ReleaseManagementConfig,
): ReleaseManagementComponents {
  const appHost = new AppHostClient({
    baseUrl: config.appHostUrl,
    controlToken: config.appHostControlToken,
    uploadTimeoutMs: config.appHostUploadTimeoutMs,
  });
  const store = createDeploymentStore(config);
  const appStore = new JsonManagedAppStore(
    path.resolve(config.appStorePath ?? `${config.storePath}.apps`),
  );
  const workflowStore = config.approvalRequired
    ? new JsonReleaseWorkflowStore(
        path.resolve(
          config.workflowStorePath ?? `${config.storePath}.workflow`,
        ),
      )
    : undefined;
  const authorize =
    config.nativeAuth && config.database
      ? createNativeReleaseAuthorizer({
          auth: config.nativeAuth,
          database: config.database,
          adminEmails: config.adminEmails,
        })
      : config.nocoBaseApiUrl
        ? createNocoBaseReleaseAuthorizer({
            apiUrl: config.nocoBaseApiUrl,
            allowedRoles: config.allowedRoles,
          })
        : unavailableReleaseAuthorizer();

  return {
    service: new ReleaseManagementService(
      appHost,
      store,
      workflowStore
        ? {
            store: workflowStore,
            notifications: new StoreReleaseNotificationSink(workflowStore),
          }
        : undefined,
      new JsonAppLifecycleOperationStore(
        path.resolve(`${config.storePath}.lifecycle`),
      ),
      appStore,
    ),
    authorize,
    authorizeArtifactUpload: createDeploymentTokenAuthorizer(
      config.deployToken,
    ),
    approvalRequired: config.approvalRequired ?? false,
    rollbackEnabled: config.rollbackEnabled ?? false,
  };
}

function createDeploymentStore(
  config: ReleaseManagementConfig,
): DeploymentStore {
  if (config.nativeAuth && config.database) {
    return new JsonDeploymentStore(path.resolve(config.storePath));
  }
  if (!config.nocoBaseApiUrl) {
    return new UnavailableDeploymentStore(
      'NocoBase API is not configured for release audit storage',
    );
  }
  if (!config.auditAccessToken) {
    return new UnavailableDeploymentStore(
      'NocoBase release audit access token is not configured',
    );
  }

  return new NocoBaseDeploymentStore({
    apiUrl: config.nocoBaseApiUrl,
    accessToken: config.auditAccessToken,
    role: config.auditRole,
    collectionName: config.auditCollection,
    legacyFilePath: path.resolve(config.storePath),
  });
}

class UnavailableDeploymentStore implements DeploymentStore {
  constructor(private readonly message: string) {}

  list(): Promise<never> {
    return Promise.reject(this.error());
  }

  findByIdempotencyKey(): Promise<never> {
    return Promise.reject(this.error());
  }

  save(): Promise<never> {
    return Promise.reject(this.error());
  }

  private error(): ReleaseManagementError {
    return new ReleaseManagementError(this.message, {
      status: 503,
      code: 'RELEASE_AUDIT_NOT_CONFIGURED',
    });
  }
}
