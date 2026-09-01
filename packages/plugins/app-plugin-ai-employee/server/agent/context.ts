import type { AgentContext, AgentState } from '@nocobase/ai-employee';
import type { Context } from '../context.js';
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
  state?: Partial<AgentState>;
}

export function createAgentContext(
  ctx: Context,
  options: CreateAgentContextOptions = {},
): AppAgentContext {
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
    ...options.state,
  };
  const services: AppAgentServices = {
    aiEmployees: {
      resolveModel: (employee, model) =>
        ctx.aiEmployeesManager.resolveModel(employee, model),
    },
    aiConversations: {
      create: (params) => ctx.aiConversationsManager.create(params),
      resolveSubAgentConversation: async (sessionId, toolCallId) => {
        if (!sessionId || !toolCallId) return null;
        return ctx.aiConversationsManager.resolveSubAgentConversation(
          sessionId,
          toolCallId,
        );
      },
      getUserDecisions: async (messageId) =>
        (await ctx.aiConversationsManager.getUserDecisions(messageId)) ?? null,
    },
    builtIn: {
      localize: (employee) =>
        ctx.builtInManager.setupBuiltInInfo(ctx, employee),
    },
    knowledgeBase: {
      retrievePrompt: (params) =>
        ctx.knowledgeBaseManager.retrievePrompt(params),
    },
    subAgents: {
      run: (task) => ctx.subAgentsDispatcher.run(task),
    },
    frontendTools: {
      find: (toolId) => findCurrentFrontendTool(ctx, toolId, execution),
      readResult: (toolCallId) =>
        readFrontendToolResult(execution ?? {}, toolCallId),
    },
  };

  return {
    ai: ctx.ai,
    database: ctx.databaseManager,
    logger: ctx.logger,
    repositories: {
      aiConversations: ctx.repositories.aiConversations,
      aiEmployees: ctx.repositories.aiEmployees,
      aiMessages: ctx.repositories.aiMessages,
      aiToolMessages: ctx.repositories.aiToolMessages,
      usersAiEmployees: ctx.repositories.usersAiEmployees,
      lcCheckpoints: ctx.repositories.lcCheckpoints,
      lcCheckpointBlobs: ctx.repositories.lcCheckpointBlobs,
      lcCheckpointWrites: ctx.repositories.lcCheckpointWrites,
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
