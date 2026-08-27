import path from 'node:path';

import {
  createNativeSettingsAuthorizer,
  createNocoBaseSettingsAuthorizer,
  unavailableSettingsAuthorizer,
  type NativeSessionReader,
  type SettingsAuthorizer,
} from './authorization.js';
import type { DatabaseManager } from '@nocobase/app-database';
import { createSettingsSecretBox } from './crypto.js';
import { JsonSettingsStore } from './store.js';
import { SettingsService } from './service.js';

export interface SettingsManagementConfig {
  storePath: string;
  encryptionKey?: string;
  nativeAuth?: NativeSessionReader;
  database?: Pick<DatabaseManager, 'query'>;
  adminEmails?: string[];
  nocoBaseApiUrl?: string;
  allowedRoles?: string[];
}

export interface SettingsManagementComponents {
  service: SettingsService;
  authorize: SettingsAuthorizer;
}

export function createSettingsManagement(
  config: SettingsManagementConfig,
): SettingsManagementComponents {
  const authorize =
    config.nativeAuth && config.database
      ? createNativeSettingsAuthorizer({
          auth: config.nativeAuth,
          database: config.database,
          adminEmails: config.adminEmails,
        })
      : config.nocoBaseApiUrl
        ? createNocoBaseSettingsAuthorizer({
            apiUrl: config.nocoBaseApiUrl,
            allowedRoles: config.allowedRoles,
          })
        : unavailableSettingsAuthorizer();

  return {
    service: new SettingsService(
      new JsonSettingsStore(path.resolve(config.storePath)),
      createSettingsSecretBox(config.encryptionKey),
    ),
    authorize,
  };
}
