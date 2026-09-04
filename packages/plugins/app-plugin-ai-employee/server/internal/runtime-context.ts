/* eslint-disable @typescript-eslint/no-explicit-any -- The plugin request context intentionally models dynamic framework fields and manager extensions. */
import type {
  AIManager,
  AIMessageInput,
  FileStorage,
} from '@nocobase/ai-employee';
import type { DatabaseConnection, DatabaseManager } from '@nocobase/db';
import type { Caching } from '@nocobase/caching';
import type { IdGeneratorService } from '@nocobase/snowflake';
import type { AIFileEntity } from '../repository/ai-file.js';
import type { AIFileMetadataCreateContext } from '../file-storage/ai-file-metadata-repository.js';

export type CurrentUser = {
  id: string | number;
  roles: string[];
  isRoot: boolean;
  locale?: string;
  scope?: string;
};

export interface StreamTarget {
  write(chunk: unknown): void;
  end(chunk?: unknown): void;
  headersSent?: boolean;
  readonly destroyed?: boolean;
  readonly writableEnded?: boolean;
}

export interface FrontendToolResultInput {
  id: string;
  result: any;
}

export interface ConversationRequestExecution {
  sessionId?: string;
  messageId?: string;
  messages?: AIMessageInput[];
  model?: any;
  webSearch?: boolean;
  important?: string;
  frontendTools?: unknown[];
  toolCallResults?: FrontendToolResultInput[];
  streamTarget?: StreamTarget;
  abortSignal?: AbortSignal;
  timezone?: string;
}
export interface Context {
  ai: AIManager;
  database: DatabaseConnection;
  databaseManager: DatabaseManager;
  logger: any;
  caching: Caching;
  fileStorage: FileStorage<AIFileEntity, AIFileMetadataCreateContext>;
  snowflake: IdGeneratorService;
  currentUser: CurrentUser;
  i18nNamespace?: string;
  sendSyncMessage?: (message: any) => void;
  requestExecution?: ConversationRequestExecution;
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
