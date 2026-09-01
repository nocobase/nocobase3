import type {
  AIEmployeeEntity,
  AIMessageInput,
  UserDecision,
} from '@nocobase/ai-employee';
import type { FrontendToolManifest } from '../ai-employees/common/frontend-tools.js';
import type { ModelRef } from '../ai-employees/ai-employee.js';
import type { CreateAIConversationParams } from '../ai-employees/ai-conversations.js';
import type { AIConversationEntity } from '../repository/ai-conversation.js';

export interface AgentUserDecisionResult {
  interruptId?: string;
  decisions: UserDecision[];
}

export interface AgentEmployeeService {
  resolveModel(
    employee: AIEmployeeEntity,
    model?: ModelRef | null,
  ): Promise<ModelRef>;
}

export interface AgentConversationService {
  create(options: CreateAIConversationParams): Promise<AIConversationEntity>;
  resolveSubAgentConversation(
    sessionId?: string,
    toolCallId?: string,
  ): Promise<AIConversationEntity | null>;
  getUserDecisions(messageId: string): Promise<AgentUserDecisionResult | null>;
}

export interface AgentBuiltInService {
  localize(employee: AIEmployeeEntity): void;
}

export interface AgentKnowledgeBaseService {
  retrievePrompt(options: { username: string; query: string }): Promise<string>;
}

export interface AgentSubAgentTask {
  sessionId: string;
  employee: AIEmployeeEntity;
  model: ModelRef;
  question: string;
  skillSettings?: Record<string, unknown>;
  webSearch?: boolean;
  messages?: AIMessageInput[];
  writer?: (chunk: unknown) => void;
}

export interface AgentSubAgentService {
  run(task: AgentSubAgentTask): Promise<string>;
}

export interface AgentFrontendToolService {
  find(toolId: string): Promise<FrontendToolManifest | undefined>;
  readResult(
    toolCallId: string,
  ): { provided: true; value: unknown } | undefined;
}

export interface AppAgentServices {
  aiEmployees: AgentEmployeeService;
  aiConversations: AgentConversationService;
  builtIn: AgentBuiltInService;
  knowledgeBase: AgentKnowledgeBaseService;
  subAgents: AgentSubAgentService;
  frontendTools: AgentFrontendToolService;
}
