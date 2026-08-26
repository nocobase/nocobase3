import type { FileManager } from '../manager/file/index.js';

export interface RuntimeLogger {
  trace(message: string, context?: Record<string, unknown>): void;
  trace(context: Record<string, unknown>, message?: string): void;
  debug?(message: string, context?: Record<string, unknown>): void;
  debug?(context: Record<string, unknown>, message?: string): void;
  info?(message: string, context?: Record<string, unknown>): void;
  info?(context: Record<string, unknown>, message?: string): void;
  warn(message: string, context?: Record<string, unknown>): void;
  warn(context: Record<string, unknown>, message?: string): void;
  error(message: string, context?: Record<string, unknown>): void;
  error(context: Record<string, unknown>, message?: string): void;
}

export interface RuntimeCache {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, ttl?: number): Promise<void>;
  del?(key: string): Promise<void>;
}

export interface RuntimeCaching {
  getCache(options: { namespace: string }): RuntimeCache;
}

export interface RuntimeTransactionManager {
  transaction<T>(callback: (connection: unknown) => Promise<T>): Promise<T>;
}

export interface RuntimeIdGenerator {
  generate(): string | number | bigint;
}

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

/** Framework-neutral structural context shared by the AI core and App plugin. */
export interface Context<TRepositories = any> {
  database: any;
  repositories: TRepositories;
  ai?: any;
  logger: any;
  caching: any;
  fileManager: FileManager;
  llmStreamCachedManager?: any;
  aiEmployeesManager?: any;
  aiConversationsManager?: any;
  builtInManager?: any;
  subAgentsDispatcher?: any;
  workContextHandler?: any;
  knowledgeBaseManager?: any;
  documentLoaders?: any;
  snowflake?: RuntimeIdGenerator;
  sendSyncMessage?: (message: unknown) => void;
  currentUser: CurrentUser;
  i18nNamespace?: string;
  ready?: Promise<void>;
  accessPolicy?: any;
  employeeService?: any;
  modelService?: any;
  fileService?: any;
  toolService?: any;
  skillService?: any;
  llmService?: any;
  mcpServerService?: any;
  res: {
    write(chunk: any): void;
    end(chunk?: any): void;
    headersSent?: boolean;
  };
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
