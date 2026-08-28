import type { DatabaseManager } from '@nocobase/app-database';
import type { Logger } from '@nocobase/logging';
import type { AIManager } from '../manager/index.js';
import type { AIMessageInput } from './ai-chat-conversation.type.js';

export interface AgentToolCallResult {
  id: string;
  result: unknown;
}

export interface AgentState {
  sessionId?: string;
  messageId?: string;
  messages?: AIMessageInput[];
  model?: Record<string, unknown>;
  webSearch?: boolean;
  important?: string;
  frontendTools?: unknown[];
  toolCallResults?: AgentToolCallResult[];
  timezone?: string;
}

export interface AgentActor {
  id: string | number;
  roles: string[];
  isRoot: boolean;
  locale?: string;
}

export interface AgentContext<TRepositories = unknown, TServices = unknown> {
  ai: AIManager;
  database: DatabaseManager;
  logger: Logger;
  repositories: TRepositories;
  services: TServices;
  state: AgentState;
  actor: AgentActor;
  translate?: (key: string, options?: Record<string, unknown>) => string;
}
