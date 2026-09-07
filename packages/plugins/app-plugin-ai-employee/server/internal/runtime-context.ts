/* eslint-disable @typescript-eslint/no-explicit-any -- The plugin request context intentionally models dynamic framework fields and manager extensions. */
import type { AIManager, FileStorage } from '@nocobase/ai-employee';
import type { DatabaseConnection, DatabaseManager } from '@nocobase/db';
import type { Caching } from '@nocobase/caching';
import type { IdGeneratorService } from '@nocobase/snowflake';
import type { AIFileEntity } from '../repository/ai-file.js';
import type { AIFileMetadataCreateContext } from '../repository/file-storage/ai-file-metadata-repository.js';
import type { Actor } from '../domain/contracts.js';
import type { ConversationExecution } from '../agent/contracts.js';

export interface Context {
  ai: AIManager;
  database: DatabaseConnection;
  databaseManager: DatabaseManager;
  logger: any;
  caching: Caching;
  fileStorage: FileStorage<AIFileEntity, AIFileMetadataCreateContext>;
  snowflake: IdGeneratorService;
  currentUser: Actor;
  i18nNamespace?: string;
  sendSyncMessage?: (message: any) => void;
  requestExecution?: ConversationExecution;
  get(name: string): string | undefined;
  set(...args: any[]): void;
  status?: number;
  t?(key: string, options?: any): string;
  throw?(status: number, message?: string): never;
  auth?: { user?: { id?: number | string; [key: string]: any } };
  state: {
    currentUser?: { id?: number | string; [key: string]: any };
    currentRole?: string;
    currentRoles?: string[];
    [key: string]: any;
  };
  getCurrentLocale?(): string | undefined;
  initialized?: boolean;
  [key: string]: any;
}

export type PluginToolsContext = Context;
