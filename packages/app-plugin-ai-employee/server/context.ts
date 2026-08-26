/* eslint-disable @typescript-eslint/no-explicit-any -- The plugin request context intentionally models dynamic framework fields and manager extensions. */
import type {
  AIManager,
  CurrentUser,
  DocumentLoaders,
  FileManager,
  RuntimeActor,
  RuntimeIdGenerator,
} from '@nocobase/ai-employee';
import type { DatabaseConnection } from '@nocobase/app-database';
import type { Caching } from '@nocobase/caching';
import type { WorkContextHandler } from './work-context/index.js';

export interface ActionParams {
  values?: any;
  [key: string]: any;
}

export interface Context<TRepositories = any> {
  ai: AIManager;
  database: DatabaseConnection;
  repositories: TRepositories;
  logger: any;
  caching: Caching;
  fileManager: FileManager;
  snowflake: RuntimeIdGenerator;
  currentUser: CurrentUser;
  accessPolicy: any;
  employeeService: any;
  modelService: any;
  fileService: any;
  toolService: any;
  skillService: any;
  llmService: any;
  mcpServerService: any;
  aiEmployeesManager: any;
  aiConversationsManager: any;
  builtInManager: any;
  llmStreamCachedManager: any;
  subAgentsDispatcher: any;
  knowledgeBaseManager: any;
  workContextHandler: WorkContextHandler;
  documentLoaders: DocumentLoaders;
  i18nNamespace?: string;
  ready?: Promise<void>;
  sendSyncMessage?: (message: any) => void;
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
  actor?: RuntimeActor;
  initialized?: boolean;
  [key: string]: any;
}

export type PluginToolsContext = Context;
