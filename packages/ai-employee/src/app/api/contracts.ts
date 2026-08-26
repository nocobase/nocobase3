import type { ModelRef } from '../../index.js';

export type AIEmployeeDefinition = {
  username: string;
  nickname?: string;
  position?: string;
  bio?: string;
  greeting?: string;
  avatar?: string;
  category?: string;
  deprecated?: boolean;
  builtIn?: boolean;
  enabled?: boolean;
  systemPrompt?: string | null;
  chatSettings?: Record<string, unknown>;
  skillSettings?: {
    skills?: string[];
    tools?: Array<{ name: string; autoCall?: boolean }>;
  };
  modelSettings?: {
    enabled?: boolean;
    llmService?: string;
    model?: string;
    models?: ModelRef[];
  };
  tools?: Array<{ name: string; autoCall?: boolean }>;
  skills?: string[];
};

export type AIStreamEvent = Record<string, unknown>;

export type AIEmployeeDto = {
  username: string;
  nickname: string;
  position?: string;
  bio?: string;
  greeting?: string;
  description?: string;
  avatar?: string;
  category?: string;
  deprecated?: boolean;
  builtIn?: boolean;
  userConfig?: { prompt?: string; sort?: number };
  chatSettings?: Record<string, unknown>;
  skillSettings?: {
    skills?: string[];
    tools?: Array<{ name: string; autoCall?: boolean }>;
  };
  modelSettings?: {
    enabled?: boolean;
    llmService?: string;
    model?: string;
    models?: ModelRef[];
  };
};

export type EnabledLLMServiceDto = {
  llmService: string;
  llmServiceTitle: string;
  provider: string;
  providerTitle?: string;
  enabledModels: Array<{ label: string; value: string }>;
  supportWebSearch: boolean;
  webSearchModels?: string[];
  isToolConflict: boolean;
};

export type CreateConversationRequest = {
  aiEmployee: AIEmployeeDto | AIEmployeeDefinition;
  systemMessage?: string;
  skillSettings?: { skills?: string[]; tools?: string[] };
  modelSettings: ModelRef;
  scope?: string;
};

export type IncomingAttachmentRef = {
  id?: string | number;
  uid?: string;
  filename: string;
  size?: number;
  mimetype?: string;
  url?: string;
  preview?: string;
  source?: {
    dataSourceKey?: string;
    collectionName?: string;
    field?: string;
    documentCache?: boolean;
  };
  [key: string]: unknown;
};

export type IncomingChatMessage = {
  key?: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: { type: string; content: unknown };
  attachments?: IncomingAttachmentRef[];
  workContext?: Array<Record<string, unknown>>;
  metadata?: Record<string, unknown>;
  toolCalls?: Array<Record<string, unknown>>;
};

export type SendMessagesRequest = {
  sessionId: string;
  aiEmployee: string;
  model: ModelRef;
  systemMessage?: string;
  skillSettings?: { skills?: string[]; tools?: string[] };
  messages: IncomingChatMessage[];
  editingMessageId?: string;
  webSearch?: boolean;
};

export type ResendMessagesRequest = {
  sessionId: string;
  messageId?: string;
  model: ModelRef;
  webSearch?: boolean;
};

export type ToolCallDecision =
  | { type: 'approve' }
  | { type: 'reject'; message?: string }
  | { type: 'edit'; editedAction: { name: string; args: unknown } };

export type UpdateToolCallDecisionRequest = {
  sessionId: string;
  messageId: string;
  toolCallId: string;
  userDecision: ToolCallDecision;
};

export type ResumeToolCallRequest = {
  sessionId: string;
  messageId?: string;
  toolCallIds?: string[];
  toolCallResults?: Array<{ id: string; result: unknown }>;
  model: ModelRef;
  webSearch?: boolean;
};

export type LocalAIActionResult =
  unknown | AsyncIterable<AIStreamEvent> | Response;
