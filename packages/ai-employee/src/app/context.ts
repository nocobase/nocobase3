import type { Caching } from '@nocobase/caching';
import type { DatabaseConnection } from '@nocobase/app-database';
import type { SnowflakeIdGenerator } from '@nocobase/id-generator';
import type { FileManager } from '../manager/file/index.js';
import type { DatabaseRepositoryFactory } from './repository/index.js';

export type CurrentUser = {
  id: string | number;
  roles: string[];
  isRoot: boolean;
  locale?: string;
  scope?: string;
};

export type RuntimeActor = {
  id: string;
  roles: string[];
  locale?: string;
  scope?: string;
};

export interface ActionParams {
  values?: any;
  [key: string]: any;
}

/** Complete shared and per-request AI employee context. */
export interface Context {
  database: DatabaseConnection;
  repositories: DatabaseRepositoryFactory;
  ai?: any;
  logger?: any;
  caching?: Caching;
  fileManager?: FileManager;
  llmStreamCachedManager?: any;
  aiEmployeesManager?: any;
  aiConversationsManager?: any;
  builtInManager?: any;
  subAgentsDispatcher?: any;
  workContextHandler?: any;
  knowledgeBaseManager?: any;
  documentLoaders?: any;
  snowflake?: SnowflakeIdGenerator;
  sendSyncMessage?: (message: unknown) => void;
  res: {
    write(chunk: any): void;
    end(chunk?: any): void;
    headersSent?: boolean;
  };
  get?(name: string): string | undefined;
  set?(...args: any[]): void;
  status?: number;
  t?(key: string, options?: any): string;
  throw?(status: number, message?: string): never;
  auth?: { user?: { id?: number | string; [key: string]: any } };
  state?: {
    currentUser?: { id?: number | string; [key: string]: any };
    currentRole?: string;
    currentRoles?: string[];
    [key: string]: any;
  };
  action?: {
    params?: ActionParams;
    resourceName?: string;
    actionName?: string;
    [key: string]: any;
  };
  request?: {
    get?(name: string): string | undefined;
    header?: Record<string, any>;
    headers?: Record<string, any>;
    [key: string]: any;
  };
  req?: {
    headers?: Record<string, any>;
    [key: string]: any;
  };
  getCurrentLocale?(): string | undefined;
  [key: string]: any;
}
