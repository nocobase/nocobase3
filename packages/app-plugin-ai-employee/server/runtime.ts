/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Team.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { Context } from './context.js';
import { createWorkContextHandler } from './agent/ai-employee/work-context/index.js';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { ConfigPaths } from '@nocobase/app-server-kit/config';
import type { NocoBaseDriveManager } from '@nocobase/drive';
import type { Auth } from '@nocobase/app-plugin-authentication';
import type { Caching } from '@nocobase/caching';
import type { DatabaseManager } from '@nocobase/app-database';
import type { SnowflakeIdGenerator } from '@nocobase/id-generator';
import type { Env, MiddlewareHandler } from 'hono';
import type { CurrentUser } from './context.js';
import {
  AIManager,
  type FileManager,
  DriveFileManager,
  MemoryFileManager,
} from '@nocobase/ai-employee';
import { CollectionRepositoryFactory } from './repository/database/factory.js';
import { AIEmployeeService } from './service/ai-employee-service.js';
import { ModelService } from './service/model-service.js';
import { AIFileService } from './service/file-service.js';
import { AIToolService } from './service/ai-tool-service.js';
import { AISkillService } from './service/ai-skill-service.js';
import { LLMService } from './service/llm-service.js';
import { AIMCPServerService } from './service/ai-mcp-server-service.js';
import { AIConversationService } from './service/ai-conversation-service.js';
import {
  AIEmployeeLoader,
  LLMServiceLoader,
  MCPLoader,
  SkillsLoader,
  ToolsLoader,
} from '@nocobase/ai-employee';
import { AIConversationsManager } from './ai-employees/ai-conversations.js';
import { KnowledgeBaseManager } from './agent/ai-employee/ai-knowledge-base.js';
import { AIEmployeesManager } from './ai-employees/ai-employees-manager.js';
import { BuiltInManager } from './ai-employees/built-in-manager.js';
import { LLMStreamCachedManager } from './ai-employees/llm-stream-manager.js';
import { SubAgentsDispatcher } from './ai-employees/sub-agents/dispatcher.js';
import { DocumentLoaders } from '@nocobase/ai-employee';
import type { Logger, Logging } from '@nocobase/logging';
import { AI_API_BASE_PATH } from './routes/contracts.js';
const I18N_NAMESPACE = '@nocobase/app-template-default';
let pluginRepositories: CollectionRepositoryFactory | undefined;
let pluginReady: Promise<void> = Promise.resolve();

declare module 'hono' {
  interface ContextVariableMap {
    ai: AIManager;
    ctx: Context;
    currentUser: CurrentUser;
  }
}

export interface AppDeps {
  ai: AIManager;
  paths: ConfigPaths;
  database: DatabaseManager;
  auth: Auth;
  caching: Caching;
  driveManager?: NocoBaseDriveManager;
  idGenerator: SnowflakeIdGenerator;
  logging: Logging;
}

export type PluginEnv = Env;
export type CreatePluginRuntimeOptions = {
  deps: AppDeps;
};

export type InitializePluginRuntimeResourcesOptions = {
  loadResources?: boolean;
};

export type ResourceLoadSummary = {
  employees: number;
  tools: number;
  skills: number;
  mcpServers: number;
  llmServices: number;
};

export type ResourceLoadOptions = {
  ai: AIManager;
  logger: Logger;
  aiDirectory: string;
  modelsDirectory?: string;
  loadLLMServices?: boolean;
  overrideTools?: boolean;
};

export async function loadResources(
  options: ResourceLoadOptions,
): Promise<ResourceLoadSummary> {
  const {
    ai,
    logger,
    aiDirectory,
    modelsDirectory = aiDirectory,
    loadLLMServices = true,
    overrideTools = false,
  } = options;
  const scan = (sub: string, pattern: string[]) => ({
    basePath: path.join(aiDirectory, sub),
    pattern,
  });

  if (loadLLMServices) {
    await new LLMServiceLoader(ai, {
      directory: modelsDirectory,
      logger,
    }).load();
  }
  await new ToolsLoader(ai, {
    overrideExisting: overrideTools,
    scan: scan('.', [
      '**/tools/**/*.ts',
      '**/tools/**/*.js',
      '!**/tools/**/*.d.ts',
      '**/tools/**/*/description.md',
    ]),
    logger,
  }).load();
  await new MCPLoader(ai, {
    scan: scan('.', ['mcp/*.ts', 'mcp/*.js', '!mcp/*.d.ts']),
    logger,
  }).load();
  await new SkillsLoader(ai, {
    scan: scan('.', ['**/skills/**/SKILLS.md']),
    logger,
  }).load();
  await new AIEmployeeLoader(ai, {
    scan: scan('.', [
      '**/employees/*.ts',
      '**/employees/*/index.ts',
      '**/employees/*.js',
      '**/employees/*/index.js',
      '**/employees/*/prompt.md',
      '!**/employees/**/*.d.ts',
    ]),
    logger,
  }).load();
  await ai.mcpServerManager.rebuildClient();

  const summary = {
    employees: (await ai.employeeManager.listEmployees()).length,
    tools: (await ai.toolsManager.listTools({})).length,
    skills: (await ai.skillsManager.listSkills()).length,
    mcpServers: (await ai.mcpServerManager.listMCP({})).length,
    llmServices: (await ai.llmServiceManager.listLLMServices()).length,
  };
  logger.info?.(summary, 'AI resources loaded');
  return summary;
}

export function createPluginContextMiddleware(
  runtime: Context,
): MiddlewareHandler<Env, string, {}, Response> {
  return async (honoContext, next) => {
    const ctx = {
      ...runtime,
      ...createRequestFields(honoContext.var.currentUser, honoContext.req.raw),
    };
    honoContext.set('ai', ctx.ai);
    honoContext.set('ctx', ctx);
    await next();
  };
}

export function createPluginRuntime(
  options: Pick<CreatePluginRuntimeOptions, 'deps'>,
): Context {
  const logger = options.deps.logging.getLogger('ai-employee');
  const databaseManager = options.deps.database;
  const database = databaseManager.connection();
  if (!pluginRepositories) {
    throw new Error(
      'Plugin repositories are not initialized. Call initializePluginRuntimeResources() before createPluginRuntime().',
    );
  }
  const repositories = pluginRepositories;
  const snowflake = options.deps.idGenerator;
  const fileManager: FileManager = options.deps.driveManager
    ? new DriveFileManager(options.deps.driveManager)
    : new MemoryFileManager();
  const ai = options.deps.ai;
  const ctx = {
    ai,
    repositories,
    database,
    databaseManager,
    logger,
    caching: options.deps.caching,
    snowflake,
    fileManager,
    i18nNamespace: I18N_NAMESPACE,
    ...createRequestFields({ id: 'system', roles: ['root'], isRoot: true }),
    employeeService: new AIEmployeeService(),
    modelService: new ModelService(),
    fileService: new AIFileService(fileManager, snowflake, AI_API_BASE_PATH),
    toolService: new AIToolService(),
    skillService: new AISkillService(),
    llmService: new LLMService(),
    mcpServerService: new AIMCPServerService(),
    aiConversationService: new AIConversationService(),
    aiEmployeesManager: null!,
    aiConversationsManager: null!,
    builtInManager: null!,
    llmStreamCachedManager: null!,
    subAgentsDispatcher: null!,
    knowledgeBaseManager: null!,
    workContextHandler: null!,
    documentLoaders: null!,
  } satisfies Context;
  Object.assign(ctx, createSupportingManagers(ctx));
  return ctx;
}

export function initializePluginRuntimeResources(
  deps: Pick<AppDeps, 'ai' | 'database' | 'idGenerator' | 'logging' | 'paths'>,
  options: InitializePluginRuntimeResourcesOptions = {},
): void {
  const { ai, database, idGenerator, paths } = deps;
  const logger = deps.logging.getLogger('ai-employee');
  const repositories = new CollectionRepositoryFactory(
    database.connection(),
    () => String(idGenerator.generate()),
  );
  pluginRepositories = repositories;
  const packageAIDirectory = resolveAIDirectory(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'ai'),
  );
  const appAIDirectory = resolveAIDirectory(paths.root('ai'));
  const storageAIDirectory = paths.storage('ai');
  pluginReady = (async () => {
    await ai.employeeManager.switchRepository(repositories.aiEmployees);
    if (options.loadResources === false) {
      await ai.llmServiceManager.switchRepository(repositories.llmServices);
      return;
    }
    await loadResources({
      ai,
      logger,
      aiDirectory: packageAIDirectory,
      loadLLMServices: false,
    });
    const summary = await loadResources({
      ai,
      logger,
      aiDirectory: appAIDirectory,
      modelsDirectory: resolveModelsDirectory(appAIDirectory, appAIDirectory),
      overrideTools: true,
    });
    await new LLMServiceLoader(ai, {
      directory: storageAIDirectory,
      logger,
      preserveUserState: false,
      replaceExisting: true,
    }).load();
    await ai.llmServiceManager.switchRepository(repositories.llmServices);
    logger.info?.(
      { aiDirectory: appAIDirectory, summary },
      'AI employee runtime initialized',
    );
  })();
  void pluginReady.catch((error) => {
    logger.error({ error }, 'AI employee runtime initialization failed');
  });
}

export function waitForPluginReady(): Promise<void> {
  return pluginReady;
}

export function createSupportingManagers(ctx: Context) {
  return {
    aiEmployeesManager: new AIEmployeesManager(
      ctx.repositories,
      ctx.ai,
      ctx.sendSyncMessage,
    ),
    aiConversationsManager: new AIConversationsManager(ctx),
    llmStreamCachedManager: new LLMStreamCachedManager(ctx),
    builtInManager: new BuiltInManager(ctx.i18nNamespace),
    subAgentsDispatcher: new SubAgentsDispatcher(ctx),
    knowledgeBaseManager: new KnowledgeBaseManager(ctx),
    workContextHandler: createWorkContextHandler(),
    documentLoaders: new DocumentLoaders(ctx),
  };
}

function createRequestFields(
  currentUser: CurrentUser,
  request?: Request,
): Pick<
  Context,
  | 'currentUser'
  | 'auth'
  | 'state'
  | 'getCurrentLocale'
  | 'get'
  | 'set'
  | 'status'
  | 't'
  | 'throw'
> {
  const userId = currentUser.id;
  const currentRole = currentUser.isRoot
    ? 'root'
    : (currentUser.roles[0] ?? 'member');
  const noop = () => {};
  return {
    currentUser,
    auth: { user: { id: userId, username: String(currentUser.id) } },
    state: {
      currentUser: { id: userId, username: String(currentUser.id) },
      currentRole,
      currentRoles: currentUser.roles,
    },
    getCurrentLocale: () =>
      currentUser.locale ?? request?.headers.get('x-locale') ?? undefined,
    get: (name: string) => request?.headers.get(name) ?? undefined,
    set: noop,
    status: undefined,
    t: (key: string) => key,
    throw: (status: number, message?: string): never => {
      const error: any = new Error(
        message ?? `Request failed with status ${status}`,
      );
      error.status = status;
      throw error;
    },
  };
}

function resolveAIDirectory(explicit?: string): string {
  const source = path.resolve(explicit ?? path.resolve(process.cwd(), 'ai'));
  const dist = path.resolve(source, '..', 'dist', 'ai');
  if (
    fs.existsSync(path.join(dist, 'package.json')) &&
    fs.existsSync(path.join(dist, 'employees'))
  )
    return dist;
  return source;
}

function resolveModelsDirectory(
  explicit: string | undefined,
  resolvedAIDirectory: string,
): string {
  const source = path.resolve(explicit ?? path.resolve(process.cwd(), 'ai'));
  return fs.existsSync(path.join(source, 'models.json'))
    ? source
    : resolvedAIDirectory;
}
