import type {
  AgentContext,
  AgentState,
  AIManager,
} from '@nocobase/ai-employee';
import type { DatabaseManager } from '@nocobase/db';
import type { Logger } from '@nocobase/logging';
import type { RepositoryFactory } from '../factory/repository-factory.js';
import type { AIEmployeesManager } from '../manager/ai-employees-manager.js';
import type { AIConversationsManager } from '../manager/ai-conversations-manager.js';
import type { BuiltInManager } from '../manager/built-in-manager.js';
import type { KnowledgeBaseManager } from '../manager/knowledge-base-manager.js';
import type { SubAgentsDispatcher } from '../manager/sub-agents/dispatcher.js';
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
import type { AppAgentServices, ConversationExecution } from './contracts.js';
import type { Actor, Translate } from '../domain/contracts.js';

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
  readonly actor: Actor;
  readonly execution?: ConversationExecution;
  readonly state?: Partial<AgentState>;
  readonly ai: AIManager;
  readonly database: DatabaseManager;
  readonly logger: Logger;
  readonly repositories: RepositoryFactory;
  readonly aiEmployeesManager: AIEmployeesManager;
  readonly aiConversationsManager: AIConversationsManager;
  readonly builtInManager: BuiltInManager;
  readonly knowledgeBaseManager: KnowledgeBaseManager;
  readonly subAgentsDispatcher: SubAgentsDispatcher;
  readonly translate?: Translate;
  readonly getHeader?: (name: string) => string | undefined;
}

export function createAgentContext({
  actor,
  execution = {},
  state: stateOverrides,
  ai,
  database,
  logger,
  repositories,
  aiEmployeesManager,
  aiConversationsManager,
  builtInManager,
  knowledgeBaseManager,
  subAgentsDispatcher,
  translate,
  getHeader,
}: CreateAgentContextOptions): AppAgentContext {
  const state: AgentState = {
    sessionId: execution.sessionId,
    messageId: execution.messageId,
    messages: execution.messages ? [...execution.messages] : undefined,
    model: execution.model ? { ...execution.model } : undefined,
    webSearch: execution.webSearch,
    important: execution.important,
    frontendTools: execution.frontendTools
      ? [...execution.frontendTools]
      : undefined,
    toolCallResults: execution.toolCallResults
      ? [...execution.toolCallResults]
      : undefined,
    timezone: execution.timezone,
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
      localize: (employee) =>
        builtInManager.setupBuiltInInfo({ employee, translate }),
    },
    knowledgeBase: {
      retrievePrompt: (params) => knowledgeBaseManager.retrievePrompt(params),
    },
    subAgents: {
      run: (task) =>
        subAgentsDispatcher.run(task, {
          actor,
          execution,
          translate,
          getHeader,
        }),
    },
    frontendTools: {
      find: (toolId) =>
        findCurrentFrontendTool(repositories, toolId, execution),
      readResult: (toolCallId) => readFrontendToolResult(execution, toolCallId),
    },
  };

  return {
    ai,
    database,
    logger,
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
      id: actor.id,
      roles: [...actor.roles],
      isRoot: actor.isRoot,
      locale: actor.locale,
    },
    translate,
  };
}
