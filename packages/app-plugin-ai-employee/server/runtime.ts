/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Team.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { NocoBaseDriveManager } from '@nocobase/drive';
import type { Auth } from '@nocobase/app-plugin-authentication';
import type { Caching } from '@nocobase/caching';
import type { DatabaseConnection } from '@nocobase/app-database';
import type { SnowflakeIdGenerator } from '@nocobase/id-generator';
import type { Env, Hono, MiddlewareHandler } from 'hono';
import type { Context, CurrentUser, RuntimeActor } from '@nocobase/ai-employee';
import {
  AIManager,
  type FileManager,
  DriveFileManager,
  MemoryFileManager,
} from '@nocobase/ai-employee';
import { CollectionRepositoryFactory } from './repository/database/factory.js';
import { initializeAIEmployeeCollections } from '../database/collections/index.js';
import { AIEmployeeAccessPolicy } from './auth/access-policy.js';
import type { CurrentActorResolver } from './auth/current-actor.js';
import { AIEmployeeService } from './service/ai-employee-service.js';
import { ModelService } from './service/model-service.js';
import { AIFileService } from './service/file-service.js';
import { AIToolService } from './service/ai-tool-service.js';
import { AISkillService } from './service/ai-skill-service.js';
import { LLMService } from './service/llm-service.js';
import { AIMCPServerService } from './service/ai-mcp-server-service.js';
import { registerAIEmployeeRoutes } from './routes/router.js';
import {
  AIEmployeeLoader,
  LLMServiceLoader,
  MCPLoader,
  SkillsLoader,
  ToolsLoader,
} from '@nocobase/ai-employee';
import { AIConversationsManager } from './ai-employees/ai-conversations.js';
import { KnowledgeBaseManager } from './ai-employees/ai-knowledge-base.js';
import { AIEmployeesManager } from './ai-employees/ai-employees-manager.js';
import { BuiltInManager } from './ai-employees/built-in-manager.js';
import { LLMStreamCachedManager } from './ai-employees/llm-stream-manager.js';
import { SubAgentsDispatcher } from './ai-employees/sub-agents/dispatcher.js';
import { DocumentLoaders } from '@nocobase/ai-employee';
import type { Logging } from '@nocobase/logging';

const I18N_NAMESPACE = '@nocobase/app-template-default';
const installations = new WeakSet<object>();
const runtimes = new WeakMap<object, Context>();

declare module 'hono' {
  interface ContextVariableMap {
    ai: AIManager;
    ctx: Context;
  }
}

export interface AppDeps {
  ai: AIManager;
  database: DatabaseConnection;
  auth: Auth;
  caching: Caching;
  driveManager?: NocoBaseDriveManager;
  idGenerator: SnowflakeIdGenerator;
  logging: Logging;
}

export type AIEmployeeEnv = Env;
export type InstallAIEmployeeOptions = {
  apiBasePath: string;
  aiDirectory?: string;
  enabled?: boolean;
  deps: AppDeps;
  currentActorResolver?: CurrentActorResolver;
};

export type ResourceLoadSummary = {
  employees: number;
  tools: number;
  skills: number;
  mcpServers: number;
  llmServices: number;
};

export type ResourceLoadOptions = {
  ctx: Context;
  aiDirectory: string;
  modelsDirectory?: string;
  loadLLMServices?: boolean;
  overrideTools?: boolean;
};

export async function loadResources(
  options: ResourceLoadOptions,
): Promise<ResourceLoadSummary> {
  const {
    ctx,
    aiDirectory,
    modelsDirectory = aiDirectory,
    loadLLMServices = true,
    overrideTools = false,
  } = options;
  const { ai, logger } = ctx;
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

export function createAIEmployeeContextMiddleware(
  runtime: Context,
  currentActorResolver: CurrentActorResolver | undefined,
  auth: AppDeps['auth'],
): MiddlewareHandler<Env, string, {}, Response> {
  return async (honoContext, next) => {
    const actor = currentActorResolver
      ? currentActorResolver.resolve(honoContext.req.raw)
      : await resolveAuthenticatedActor(auth, honoContext.req.raw);
    const ctx = {
      ...runtime,
      ...createRequestFields(actor, honoContext.req.raw),
    };
    honoContext.set('ai', ctx.ai);
    honoContext.set('ctx', ctx);
    await next();
  };
}

export function createAIEmployeeRuntime(
  options: Pick<InstallAIEmployeeOptions, 'apiBasePath' | 'deps'>,
): Context {
  const logger = options.deps.logging.getLogger('ai-employee');
  const repositories = new CollectionRepositoryFactory(
    options.deps.database,
    () => String(options.deps.idGenerator.generate()),
  );
  const snowflake = options.deps.idGenerator;
  const fileManager: FileManager = options.deps.driveManager
    ? new DriveFileManager(options.deps.driveManager)
    : new MemoryFileManager();
  const ai = options.deps.ai;
  const ctx = ai.context;

  const accessPolicy = new AIEmployeeAccessPolicy();
  Object.assign(ctx, {
    ai,
    repositories,
    database: options.deps.database,
    logger,
    caching: options.deps.caching,
    snowflake,
    fileManager,
    i18nNamespace: I18N_NAMESPACE,
    ...createRequestFields({ id: 'system', roles: ['root'] }),
    ready: Promise.resolve(),
    accessPolicy,
    employeeService: new AIEmployeeService(accessPolicy),
    modelService: new ModelService(),
    fileService: new AIFileService(fileManager, snowflake, options.apiBasePath),
    toolService: new AIToolService(accessPolicy),
    skillService: new AISkillService(accessPolicy),
    llmService: new LLMService(accessPolicy),
    mcpServerService: new AIMCPServerService(accessPolicy),
  });
  Object.assign(ctx, createSupportingManagers(ctx));
  return ctx;
}

/** Initializes the database-backed runtime and starts resource loading. */
export function initializeAIEmployee(
  options: InstallAIEmployeeOptions,
): Context {
  const existing = runtimes.get(options.deps.ai);
  if (existing) return existing;
  const ctx = createAIEmployeeRuntime(options);
  runtimes.set(options.deps.ai, ctx);
  const { logger } = ctx;
  const builtinDirectory = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    'builtin',
  );
  const aiDirectory = resolveAIDirectory(options.aiDirectory);
  ctx.ready = (async () => {
    await initializeAIEmployeeCollections(options.deps.database);
    await loadResources({
      ctx,
      aiDirectory: builtinDirectory,
      loadLLMServices: false,
    });
    const summary = await loadResources({
      ctx,
      aiDirectory,
      modelsDirectory: resolveModelsDirectory(options.aiDirectory, aiDirectory),
      overrideTools: true,
    });
    logger.info?.({ aiDirectory, summary }, 'AI employee runtime initialized');
  })();
  void ctx.ready.catch((error) => {
    logger.error({ error }, 'AI employee runtime initialization failed');
  });
  return ctx;
}

/** Registers request context middleware and action routes on one Hono app. */
export function registerAIEmployeeAppRoutes(
  app: Hono,
  options: Pick<
    InstallAIEmployeeOptions,
    'apiBasePath' | 'deps' | 'currentActorResolver'
  >,
): void {
  if (installations.has(app)) return;
  const ctx = options.deps.ai.context;
  installations.add(app);
  app.use(
    '*',
    createAIEmployeeContextMiddleware(
      ctx,
      options.currentActorResolver,
      options.deps.auth,
    ),
  );
  registerAIEmployeeRoutes(app, options.apiBasePath);
}

/** Compatibility helper for embedding the plugin without plugin discovery. */
export function installAIEmployee(
  app: Hono,
  options: InstallAIEmployeeOptions,
): void {
  if (options.enabled === false || installations.has(app)) return;
  initializeAIEmployee(options);
  registerAIEmployeeAppRoutes(app, options);
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
    subAgentsDispatcher: new SubAgentsDispatcher(),
    knowledgeBaseManager: createKnowledgeBaseManager(),
    workContextHandler: createWorkContextHandler(),
    documentLoaders: new DocumentLoaders(ctx),
  };
}

export function createKnowledgeBaseManager(): any {
  return {
    async isEnabledKnowledgeBase(): Promise<boolean> {
      return false;
    },
    async retrievePrompt(): Promise<string> {
      return '';
    },
  };
}

export function createWorkContextHandler(): any {
  return {
    registerStrategy() {},
    async resolve(_ctx: unknown, workContext: any[]): Promise<string[]> {
      if (!Array.isArray(workContext)) return [];
      return workContext
        .map((item) =>
          item && typeof item === 'object' && item.content != null
            ? String(item.content)
            : '',
        )
        .filter(Boolean);
    },
    async background(): Promise<string[]> {
      return [];
    },
  };
}

async function resolveAuthenticatedActor(
  auth: AppDeps['auth'],
  request: Request,
): Promise<RuntimeActor> {
  const session = await auth.getSession(request.headers);
  const user = session?.user;
  if (!user?.id) return { id: 'anonymous', roles: ['member'] };
  const profile = user as typeof user & Record<string, unknown>;
  const rawRoles = Array.isArray(profile.roles)
    ? profile.roles.filter((role): role is string => typeof role === 'string')
    : [];
  return {
    id: String(user.id),
    roles: rawRoles.length ? rawRoles : ['member'],
    locale: typeof profile.locale === 'string' ? profile.locale : undefined,
  };
}

function createRequestFields(
  actor: RuntimeActor,
  request?: Request,
): Pick<
  Context,
  | 'currentUser'
  | 'res'
  | 'auth'
  | 'state'
  | 'action'
  | 'request'
  | 'req'
  | 'getCurrentLocale'
  | 'get'
  | 'set'
  | 'status'
  | 't'
  | 'throw'
> {
  const currentUser = toCurrentUser(actor);
  const userId = currentUser.id;
  const currentRole = currentUser.isRoot
    ? 'root'
    : (currentUser.roles[0] ?? 'member');
  const noop = () => {};
  return {
    currentUser,
    res: { write: noop, end: noop, headersSent: false },
    auth: { user: { id: userId, username: actor.id } },
    state: {
      currentUser: { id: userId, username: actor.id },
      currentRole,
      currentRoles: currentUser.roles,
    },
    action: { params: { values: {} } },
    request: request
      ? {
          get: (name: string) => request.headers.get(name) ?? undefined,
          headers: Object.fromEntries(request.headers.entries()),
        }
      : undefined,
    req: request
      ? {
          headers: Object.fromEntries(request.headers.entries()),
          once: noop,
          off: noop,
        }
      : undefined,
    getCurrentLocale: () =>
      actor.locale ?? request?.headers.get('x-locale') ?? currentUser.locale,
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

function toCurrentUser(actor: RuntimeActor): CurrentUser {
  const numericId = Number(actor.id);
  const id = Number.isFinite(numericId) ? numericId : actor.id;
  const roles = [...new Set(actor.roles.length ? actor.roles : ['member'])];
  return {
    id,
    roles,
    isRoot: roles.includes('root'),
    ...(actor.locale ? { locale: actor.locale } : {}),
    ...(actor.scope ? { scope: actor.scope } : {}),
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
