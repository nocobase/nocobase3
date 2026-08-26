import type {
  AIMessage as LangChainAIMessage,
  HumanMessage,
  ToolMessage,
} from '@langchain/core/messages';
import type { BaseCheckpointSaver, Command } from '@langchain/langgraph';
import type { CreateAgentParams } from 'langchain';
import type { LLMProvider } from '@nocobase/ai-employee';
import type { ToolsEntity } from '@nocobase/ai-employee';
import type { Logger } from '@nocobase/logging';
import type {
  AIMessage,
  AIMessageInput,
  AIToolCall,
  AIToolMessage,
  UserDecision,
} from '@nocobase/ai-employee';

export type AgentExecutionSource = 'main-agent' | 'sub-agent' | (string & {});
export type AgentExecutionMode = 'streaming' | 'invoking';
export type AgentOperation = 'stream' | 'invoke' | 'resume' | 'fork';

export interface AgentConversationIdentity {
  sessionId: string;
  username?: string;
  from?: AgentExecutionSource;
  metadata?: Record<string, unknown>;
}

export interface AgentRequest {
  messageId?: string;
  userMessages?: AIMessageInput[];
  userDecisions?: {
    interruptId?: string;
    decisions: UserDecision[];
  };
  context?: Record<string, unknown>;
  writer?: (chunk: unknown) => void;
  signal?: AbortSignal;
}

export interface AgentThread {
  sessionId: string;
  thread: number;
  threadId: string;
}

export interface AgentMessageIndex {
  lastHumanMessageIndex: number;
  lastAIMessageIndex: number;
  lastToolMessageIndex: number;
  lastMessageIndex: number;
}

export interface AgentState {
  messageId?: string;
  lastMessageIndex: AgentMessageIndex;
  [key: string]: unknown;
}

export type PreparedAgentInput =
  Command | ({ messages: unknown[] } & Partial<AgentState>) | null;

export interface AgentMessageConversionContext {
  providerName: string;
  llmService?: string;
  model: string;
  provider: LLMProvider;
}

/**
 * Inputs prepared for the infrastructure-owned pipeline. Deliberately has no
 * middleware field: only AgentService may create or order middleware.
 */
export interface PreparedAgentContext extends AgentMessageConversionContext {
  input: PreparedAgentInput;
  systemPrompt?: CreateAgentParams['systemPrompt'];
  tools: CreateAgentParams['tools'];
  sourceTools: ToolsEntity[];
  baseToolNames: Set<string>;
  config: Record<string, any>;
  state?: AgentState;
  thread?: AgentThread;
  checkpointer?: BaseCheckpointSaver | boolean;
  metadata: {
    currentConversation: AgentConversationIdentity;
    [key: string]: unknown;
  };
}

export interface AgentFeatureOptions {
  messageNormalization: boolean;
  contextEnrichment: boolean;
  skills: boolean;
  tools: boolean;
  toolInteraction: boolean;
  toolCallStatus: boolean;
  conversationPersistence: boolean;
  toolCallSanitizer: boolean;
  knowledgeBase: boolean;
  subAgents: boolean;
}

export const DEFAULT_AGENT_FEATURES: AgentFeatureOptions = {
  messageNormalization: true,
  contextEnrichment: true,
  skills: true,
  tools: true,
  toolInteraction: true,
  toolCallStatus: true,
  conversationPersistence: true,
  toolCallSanitizer: true,
  knowledgeBase: true,
  subAgents: true,
};

export const STANDARD_AGENT_MIDDLEWARE_ORDER = [
  'MessageNormalizationMiddleware',
  'ContextEnrichmentMiddleware',
  'SkillToolBindingMiddleware',
  'ToolInteractionMiddleware',
  'ToolCallStatusMiddleware',
  'ConversationMiddleware',
  'ToolCallSanitizerMiddleware',
] as const;

export interface AgentToolCallStatus {
  toolCall: Partial<AIToolCall> & Pick<AIToolCall, 'id' | 'name'>;
  invokeStatus:
    | 'init'
    | 'pending'
    | 'done'
    | 'error'
    | 'confirmed'
    | 'interrupted'
    | 'waiting'
    | 'cancelled';
  status?: string | null;
  invokeStartTime?: Date | string | null;
  invokeEndTime?: Date | string | null;
  content?: unknown;
  interruptAction?: AgentInterruptAction;
}

export type AgentStreamEvent =
  | { type: 'stream_start'; conversation: AgentConversationIdentity }
  | { type: 'stream_end'; conversation: AgentConversationIdentity }
  | {
      type: 'content';
      conversation: AgentConversationIdentity;
      content: unknown;
    }
  | {
      type: 'reasoning';
      conversation: AgentConversationIdentity;
      action: 'start' | 'content' | 'stop';
      content?: unknown;
    }
  | {
      type: 'web_search';
      conversation: AgentConversationIdentity;
      body: unknown;
    }
  | {
      type: 'tool_call_chunks';
      conversation: AgentConversationIdentity;
      chunks: unknown[];
    }
  | {
      type: 'tool_calls';
      conversation: AgentConversationIdentity;
      toolCalls: AIToolCall[];
    }
  | {
      type: 'tool_call_status';
      conversation: AgentConversationIdentity;
      status: AgentToolCallStatus;
    }
  | {
      type: 'interrupt_requested';
      conversation: AgentConversationIdentity;
      interruptId: string;
      actions: AgentInterruptAction[];
    }
  | {
      type: 'interrupt_resolved';
      conversation: AgentConversationIdentity;
      interruptId?: string;
    }
  | {
      type: 'message_persisted';
      conversation: AgentConversationIdentity;
      messageId?: string;
      role: string;
    }
  | { type: 'new_message'; conversation: AgentConversationIdentity }
  | { type: 'sub_agent_started'; conversation: AgentConversationIdentity }
  | { type: 'sub_agent_completed'; conversation: AgentConversationIdentity };

export type AgentServiceErrorCode =
  | 'MODEL_RESPONSE_ERROR'
  | 'GRAPH_RECURSION_ERROR'
  | 'EMPTY_RESPONSE'
  | 'PROVIDER_ERROR'
  | 'PERSISTENCE_ERROR'
  | 'ABORTED';

export interface AgentServiceErrorOptions {
  cause?: unknown;
  aborted?: boolean;
  retryable?: boolean;
}

export class AgentServiceError extends Error {
  readonly code: AgentServiceErrorCode;
  readonly cause?: unknown;
  readonly aborted: boolean;
  readonly retryable: boolean;

  constructor(
    code: AgentServiceErrorCode,
    message: string,
    options: AgentServiceErrorOptions = {},
  ) {
    super(message);
    this.name = 'AgentServiceError';
    this.code = code;
    this.cause = options.cause;
    this.aborted = options.aborted ?? code === 'ABORTED';
    this.retryable = options.retryable ?? false;
  }
}

export interface AgentInterruptPayload {
  actionRequests: { name: string; args: unknown; description: string }[];
  reviewConfigs: { actionName: string; allowedDecisions: string[] }[];
}

export interface AgentInterruptAction {
  order: number;
  description?: string;
  allowedDecisions?: string[];
  toolCall?: { id: string; name: string };
  currentConversation?: AgentConversationIdentity;
}

export interface SavedAssistantMessage {
  message: AIMessage;
  initializedToolCalls: AIToolMessage[];
}

export interface ConversationMessageStore {
  load(messageId?: string): Promise<AIMessage[]>;
  get(messageId: string): Promise<AIMessage | null>;
  add(messages: AIMessageInput): Promise<AIMessage>;
  add(messages: AIMessageInput[]): Promise<AIMessage[]>;
  remove(messageId?: string): Promise<void>;
  saveUserMessages(
    messageId: string | undefined,
    messages: AIMessageInput[],
    thread?: AgentThread,
  ): Promise<void>;
  saveAssistantMessage(
    message: AIMessageInput,
    toolCalls: AIToolCall[],
  ): Promise<SavedAssistantMessage>;
  saveToolMessages(
    messages: AIMessageInput[],
    messageId: string,
    toolCallIds: string[],
  ): Promise<void>;
  saveInterruptedAssistantMessage(message: AIMessageInput): Promise<AIMessage>;
  shouldLoadHistory(request: AgentRequest): boolean;
}

export interface ConversationToolCallStore {
  initialize(
    messageId: string,
    toolCalls: AIToolCall[],
  ): Promise<AIToolMessage[]>;
  markInterrupted(
    sessionId: string,
    messageId: string,
    toolCallId: string,
    interruptId: string,
    interruptAction: AgentInterruptAction,
  ): Promise<number>;
  markPending(messageId: string, toolCallId: string): Promise<number>;
  markDone(
    messageId: string,
    toolCallId: string,
    result: unknown,
  ): Promise<number>;
  markError(
    messageId: string,
    toolCallId: string,
    error: unknown,
  ): Promise<number>;
  confirm(messageId: string, toolCallIds: string[]): Promise<number>;
  reject(
    messageId: string,
    toolCallIds: string[],
    reason?: string,
  ): Promise<number>;
  cancel(): Promise<AIMessageInput[] | undefined>;
  get(messageId: string, toolCallId: string): Promise<AIToolMessage | null>;
  getMany(
    messageId: string,
    toolCallIds: string[],
  ): Promise<Map<string, AIToolMessage>>;
}

export interface ConversationThreadStore {
  current(): Promise<AgentThread | undefined>;
  fork(provider: LLMProvider): Promise<AgentThread | undefined>;
  shouldFork(operation: AgentOperation, request: AgentRequest): boolean;
  update(thread: AgentThread): Promise<void>;
  buildInitialState(messages: AIMessage[]): AgentState;
  useCheckpointer(): boolean;
}

export interface ConversationStreamStore {
  append(chunk: string): Promise<void>;
  clear(): Promise<void>;
  skipped(): Promise<void>;
}

export interface ConversationProvider {
  identity: AgentConversationIdentity;
  messages: ConversationMessageStore;
  toolCalls: ConversationToolCallStore;
  threads: ConversationThreadStore;
  streamCache: ConversationStreamStore;
  beforeExecution(mode: AgentExecutionMode): Promise<void>;
  afterExecution(
    mode: AgentExecutionMode,
    options?: { aborted?: boolean },
  ): Promise<void>;
  registerAbortHandle(token: symbol, handle: AgentAbortHandle): void;
  unregisterAbortHandle(token: symbol): void;
  updateAssistantResponseMetadata(
    messageId: string,
    metadata: Record<string, unknown>,
  ): Promise<void>;
  logger: Logger;
}

export interface ChatContextProvider {
  normalizeMessages(
    messages: AIMessageInput[],
    request: AgentRequest,
  ): Promise<AIMessageInput[]>;
  formatMessages(
    messages: AIMessageInput[],
    context: AgentMessageConversionContext,
  ): Promise<unknown[]>;
  getSystemPrompt(
    messages: AIMessageInput[],
    request: AgentRequest,
  ): Promise<string | undefined>;
  getExecutionContext(request: AgentRequest): Promise<Record<string, unknown>>;
  getExecutionConfig(request: AgentRequest): Promise<Record<string, unknown>>;
  convertAIMessage(
    message: LangChainAIMessage,
    context: AgentMessageConversionContext,
  ): AIMessageInput;
  convertHumanMessage(
    message: HumanMessage,
    context: AgentMessageConversionContext,
  ): AIMessageInput;
  convertToolMessage(
    message: ToolMessage,
    context: AgentMessageConversionContext,
  ): AIMessageInput;
  getUserMessageCount(request: AgentRequest): number;
}

export interface ToolProvider {
  listTools(): Promise<ToolsEntity[]>;
  getBaseToolNames(tools: ToolsEntity[]): Promise<Set<string>>;
  getActivatedSkillToolNames(): Promise<Set<string>>;
  getToolsMap(): Promise<Map<string, ToolsEntity>>;
  shouldInterruptToolCall(tool?: ToolsEntity): boolean;
  isAutoCall(tool?: ToolsEntity): boolean;
}

export interface AgentLLMIdentity {
  providerName: string;
  llmService?: string;
  model: string;
  getResponseMetadata?: (id: string) => Record<string, unknown> | undefined;
}

export interface AgentAbortHandle {
  readonly signal: AbortSignal;
  abort(reason?: unknown): void;
}

export interface AgentProviders {
  conversation: ConversationProvider;
  chatContext: ChatContextProvider;
  tools: ToolProvider;
  llmProvider: LLMProvider;
  llmIdentity: AgentLLMIdentity;
  checkpointer?: BaseCheckpointSaver | boolean;
  features: AgentFeatureOptions;
}

export interface AgentProviderOverrides {
  conversation?: Partial<
    Omit<
      ConversationProvider,
      'messages' | 'toolCalls' | 'threads' | 'streamCache'
    >
  > & {
    messages?: Partial<ConversationMessageStore>;
    toolCalls?: Partial<ConversationToolCallStore>;
    threads?: Partial<ConversationThreadStore>;
    streamCache?: Partial<ConversationStreamStore>;
  };
  chatContext?: Partial<ChatContextProvider>;
  tools?: Partial<ToolProvider>;
  features?: Partial<AgentFeatureOptions>;
  checkpointer?: BaseCheckpointSaver | boolean;
}

export interface CreateAgentProvidersOptions {
  llmProvider: LLMProvider;
  llmIdentity: AgentLLMIdentity;
  conversation?: ConversationProvider;
  chatContext?: ChatContextProvider;
  tools?: ToolProvider;
  features?: Partial<AgentFeatureOptions>;
  checkpointer?: BaseCheckpointSaver | boolean;
  overrides?: AgentProviderOverrides;
}

export type ToolCallHandler = ConversationToolCallStore;

export type AIEmployeeProviderOptions = {
  username?: string;
  modelRef?: {
    provider?: string;
    llmService?: string;
    model: string;
  };
  from?: AgentExecutionSource;
};

export type CreateAIEmployeeProviders = (
  options: AIEmployeeProviderOptions,
) => Promise<AgentProviders> | AgentProviders;

/** Compatibility names for the agent-internal implementation modules. */
export type AgentConversation = AgentConversationIdentity;
export type AgentExecutionRequest = AgentRequest & {
  executionMode?: 'stream' | 'invoke';
};
export type AgentServiceEvent = AgentStreamEvent;
export type PreparedAgentExecution = PreparedAgentContext & {
  conversation: AgentConversation;
  providerContext?: unknown;
  checkpointer?: unknown;
};
