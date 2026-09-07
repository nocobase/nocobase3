import type { AgentContext, AgentState } from '@nocobase/ai-employee';
import type { Context } from '../internal/runtime-context.js';
import type { RepositoryFactory } from '../repository/database/factory.js';
import type { AIEmployeesManager } from '../managers/ai-employees-manager.js';
import type { AIConversationsManager } from '../managers/ai-conversations-manager.js';
import type { BuiltInManager } from '../managers/built-in-manager.js';
import type { KnowledgeBaseManager } from '../managers/knowledge-base-manager.js';
import type { SubAgentsDispatcher } from '../managers/sub-agents/dispatcher.js';
import type {
  AIConversationRepository,
  AIMessageRepository,
  AIToolMessageRepository,
  LCCheckpointBlobRepository,
  LCCheckpointRepository,
  LCCheckpointWriteRepository,
  UserAIEmployeeRepository,
} from '../repository/index.js';
import type { AIEmployeeRepository } from '@nocobase/ai-employee';
import {
  findCurrentFrontendTool,
  readFrontendToolResult,
} from '../ai-employees/frontend-tools.js';
import type { AppAgentServices } from './contracts.js';

export interface AppAgentRepositories {
  aiConversations: AIConversationRepository;
  aiEmployees: AIEmployeeRepository;
  aiMessages: AIMessageRepository;
  aiToolMessages: AIToolMessageRepository;
  usersAiEmployees: UserAIEmployeeRepository;
  lcCheckpoints: LCCheckpointRepository;
  lcCheckpointBlobs: LCCheckpointBlobRepository;
  lcCheckpointWrites: LCCheckpointWriteRepository;
}

export type AppAgentContext = AgentContext<
  AppAgentRepositories,
  AppAgentServices
>;

export interface CreateAgentContextOptions {
  ctx: Context;
  repositories: RepositoryFactory;
  aiEmployeesManager: AIEmployeesManager;
  aiConversationsManager: AIConversationsManager;
  builtInManager: BuiltInManager;
  knowledgeBaseManager: KnowledgeBaseManager;
  subAgentsDispatcher: SubAgentsDispatcher;
  state?: Partial<AgentState>;
}

export function createAgentContext({
  ctx,
  repositories,
  aiEmployeesManager,
  aiConversationsManager,
  builtInManager,
  knowledgeBaseManager,
  subAgentsDispatcher,
  state: stateOverrides,
}: CreateAgentContextOptions): AppAgentContext {
  const execution = ctx.requestExecution;
  const state: AgentState = {
    sessionId: execution?.sessionId,
    messageId: execution?.messageId,
    messages: execution?.messages,
    model: execution?.model,
    webSearch: execution?.webSearch,
    important: execution?.important,
    frontendTools: execution?.frontendTools,
    toolCallResults: execution?.toolCallResults,
    timezone: execution?.timezone,
    ...stateOverrides,
  };
  const services: AppAgentServices = {
    aiEmployees: {
      resolveModel: (employee, model) =>
        aiEmployeesManager.resolveModel(employee, model),
    },
    aiConversations: {
      create: (params) => aiConversationsManager.create(params),
      resolveSubAgentConversation: async (sessionId, toolCallId) => {
        if (!sessionId || !toolCallId) return null;
        return aiConversationsManager.resolveSubAgentConversation(
          sessionId,
          toolCallId,
        );
      },
      getUserDecisions: async (messageId) =>
        (await aiConversationsManager.getUserDecisions(messageId)) ?? null,
    },
    builtIn: {
      localize: (employee) => builtInManager.setupBuiltInInfo(ctx, employee),
    },
    knowledgeBase: {
      retrievePrompt: (params) => knowledgeBaseManager.retrievePrompt(params),
    },
    subAgents: {
      run: (task) => subAgentsDispatcher.run(task, ctx),
    },
    frontendTools: {
      find: (toolId) =>
        findCurrentFrontendTool(repositories, toolId, execution),
      readResult: (toolCallId) =>
        readFrontendToolResult(execution ?? {}, toolCallId),
    },
  };

  return {
    ai: ctx.ai,
    database: ctx.databaseManager,
    logger: ctx.logger,
    repositories: {
      aiConversations: repositories.aiConversations,
      aiEmployees: repositories.aiEmployees,
      aiMessages: repositories.aiMessages,
      aiToolMessages: repositories.aiToolMessages,
      usersAiEmployees: repositories.usersAiEmployees,
      lcCheckpoints: repositories.lcCheckpoints,
      lcCheckpointBlobs: repositories.lcCheckpointBlobs,
      lcCheckpointWrites: repositories.lcCheckpointWrites,
    },
    services,
    state,
    actor: {
      id: ctx.currentUser.id,
      roles: ctx.state.currentRoles ?? ctx.currentUser.roles,
      isRoot: ctx.currentUser.isRoot,
      locale: ctx.currentUser.locale,
    },
    translate: ctx.t,
  };
}
