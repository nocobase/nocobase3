import path from 'node:path';
import type { DatabaseManager } from '@nocobase/app-database';
import { AppHostClient } from './app-host-client.js';
import {
  AppManagementService,
  type AppManagementRoutesOptions,
} from './app-management.js';
import {
  createNativeReleaseAuthorizer,
  createNocoBaseReleaseAuthorizer,
  unavailableReleaseAuthorizer,
  type ReleaseNativeSessionReader,
} from './authorization.js';
import {
  JsonDeploymentStore,
  type DeploymentStore,
} from './deployment-store.js';
import { ReleaseManagementError } from './errors.js';
import { NocoBaseDeploymentStore } from './nocobase-deployment-store.js';
import { JsonAppLifecycleOperationStore } from './lifecycle-operation-store.js';
import { JsonManagedAppStore } from './managed-app-store.js';
import type { ReleaseManagementRoutesOptions } from './routes.js';
import { ReleaseManagementService } from './service.js';
import {
  JsonReleaseWorkflowStore,
  StoreReleaseNotificationSink,
} from './workflow-store.js';

export interface ReleaseManagementConfig {
  appHostUrl: string;
  appHostControlToken?: string;
  nativeAuth?: ReleaseNativeSessionReader;
  database?: Pick<DatabaseManager, 'query'>;
  adminEmails?: string[];
  nocoBaseApiUrl?: string;
  auditAccessToken?: string;
  auditRole?: string;
  auditCollection?: string;
  storePath: string;
  workflowStorePath?: string;
  allowedRoles?: string[];
}

export interface ReleaseManagementComponents extends ReleaseManagementRoutesOptions {
  apps: AppManagementRoutesOptions;
}

export function createReleaseManagement(
  config: ReleaseManagementConfig,
): ReleaseManagementComponents {
  const appHost = new AppHostClient({
    baseUrl: config.appHostUrl,
    controlToken: config.appHostControlToken,
  });
  const store = createDeploymentStore(config);
  const workflowStore = new JsonReleaseWorkflowStore(
    path.resolve(config.workflowStorePath ?? `${config.storePath}.workflow`),
  );
  const managedAppStore = new JsonManagedAppStore(
    path.resolve(`${config.storePath}.apps`),
  );
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

  const apps = new AppManagementService(appHost, managedAppStore);
  const service = new ReleaseManagementService(
    appHost,
    store,
    {
      store: workflowStore,
      notifications: new StoreReleaseNotificationSink(workflowStore),
    },
    new JsonAppLifecycleOperationStore(
      path.resolve(`${config.storePath}.lifecycle`),
    ),
    managedAppStore,
  );

  return {
    service,
    authorize,
    authorizeAppDeployToken: (token, appId) =>
      apps.authorizeDeployToken(token, appId),
    apps: { service: apps, authorize },
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
