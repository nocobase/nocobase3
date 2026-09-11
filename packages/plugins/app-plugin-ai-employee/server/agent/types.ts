import type {
  AIMessage as LangChainAIMessage,
  BaseMessageLike,
  HumanMessage,
  ToolMessage,
} from '@langchain/core/messages';
import type { BaseCheckpointSaver, Command } from '@langchain/langgraph';
import type { CreateAgentParams } from 'langchain';
import type { LLMProvider } from '@nocobase/ai-employee';
import type { ToolsEntity } from '@nocobase/ai-employee';
import type { Logger } from '@nocobase/logging';
import type {
  AgentThread,
  AIMessage,
  AIMessageInput,
  AIToolCall,
  AIToolMessage,
  UserDecision,
} from '@nocobase/ai-employee';
export type { AgentThread } from '@nocobase/ai-employee';
import type { LLMStreamCached } from '../manager/llm-stream-cached-manager.js';
import type { ModelRef } from '../types.js';
export type AgentExecutionSource = 'main-agent' | 'sub-agent' | (string & {});
export type AgentExecutionMode = 'streaming' | 'invoking';
export type AgentOperation = 'stream' | 'invoke' | 'resume' | 'fork';

export interface CurrentConversation {
  sessionId: string;
  username?: string;
  from?: AgentExecutionSource;
  metadata?: Record<string, unknown>;
}

export interface AgentRequest {
  model?: ModelRef;
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

export interface AgentMessageIndex {
  lastHumanMessageIndex: number;
  lastAIMessageIndex: number;
  lastToolMessageIndex: number;
  lastMessageIndex: number;
}

export interface AgentGraphState {
  messageId?: string;
  lastMessageIndex: AgentMessageIndex;
  [key: string]: unknown;
}

export type PreparedAgentInput =
  Command | ({ messages: unknown[] } & Partial<AgentGraphState>) | null;

export interface ResolvedAgentLLM {
  readonly providerName: string;
  readonly llmService?: string;
  readonly model: string;
  readonly provider: LLMProvider;
}

export interface DiscoveredTools {
  readonly tools: ReadonlyMap<string, ToolsEntity>;
  activeTools(): Promise<ReadonlySet<string>>;
}

export type AgentMessageConversionContext = Pick<
  ResolvedAgentLLM,
  'providerName' | 'llmService' | 'model' | 'provider'
>;

/**
 * Inputs prepared for the infrastructure-owned pipeline. Deliberately has no
 * middleware field: only AgentService may create or order middleware.
 */
export interface PreparedAgentContext extends AgentMessageConversionContext {
  input: PreparedAgentInput;
  systemPrompt?: CreateAgentParams['systemPrompt'];
  tools: CreateAgentParams['tools'];
  discoveredTools: DiscoveredTools;
  llm?: ResolvedAgentLLM;
  config: Record<string, any>;
  state?: AgentGraphState;
  thread?: AgentThread;
  checkpointer?: BaseCheckpointSaver | boolean;
  metadata: {
    currentConversation: CurrentConversation;
    [key: string]: unknown;
  };
}

export interface AgentFeatureOptions {
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
  | { type: 'stream_start'; conversation: CurrentConversation }
  | { type: 'stream_end'; conversation: CurrentConversation }
  | {
      type: 'content';
      conversation: CurrentConversation;
      content: unknown;
    }
  | {
      type: 'reasoning';
      conversation: CurrentConversation;
      action: 'start' | 'content' | 'stop';
      content?: unknown;
    }
  | {
      type: 'web_search';
      conversation: CurrentConversation;
      body: unknown;
    }
  | {
      type: 'tool_call_chunks';
      conversation: CurrentConversation;
      chunks: unknown[];
    }
  | {
      type: 'tool_calls';
      conversation: CurrentConversation;
      toolCalls: AIToolCall[];
    }
  | {
      type: 'tool_call_status';
      conversation: CurrentConversation;
      status: AgentToolCallStatus;
    }
  | {
      type: 'interrupt_requested';
      conversation: CurrentConversation;
      interruptId: string;
      actions: AgentInterruptAction[];
    }
  | {
      type: 'interrupt_resolved';
      conversation: CurrentConversation;
      interruptId?: string;
    }
  | {
      type: 'message_persisted';
      conversation: CurrentConversation;
      messageId?: string;
      role: string;
    }
  | { type: 'new_message'; conversation: CurrentConversation }
  | { type: 'sub_agent_started'; conversation: CurrentConversation }
  | { type: 'sub_agent_completed'; conversation: CurrentConversation };

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
  currentConversation?: CurrentConversation;
}

export interface SavedAssistantMessage {
  message: AIMessage;
  initializedToolCalls: AIToolMessage[];
}

export interface ConversationMessageStore {
  loadMessages(messageId?: string): Promise<AIMessage[]>;
  saveUserMessages(
    messages: AIMessageInput[],
    messageId?: string,
    thread?: AgentThread,
  ): Promise<void>;
  saveAssistantMessage(
    message: AIMessageInput,
    toolMap: ReadonlyMap<string, ToolsEntity>,
  ): Promise<SavedAssistantMessage>;
  saveToolMessages(
    sourceMessageId: string,
    messages: AIMessageInput[],
  ): Promise<void>;
  updateMessage(
    messageId: string,
    patch: Partial<AIMessageInput>,
  ): Promise<void>;
  currentThread(): Promise<AgentThread | undefined>;
  updateToolInterrupted(
    sessionId: string,
    messageId: string,
    toolCallId: string,
    interruptId: string,
    interruptAction: AgentInterruptAction,
  ): Promise<number>;
  updateToolPending(messageId: string, toolCallId: string): Promise<number>;
  updateToolDone(
    messageId: string,
    toolCallId: string,
    result: unknown,
  ): Promise<number>;
  updateToolError(
    messageId: string,
    toolCallId: string,
    error: unknown,
  ): Promise<number>;
  cancelToolCall(): Promise<AIMessageInput[] | undefined>;
  getToolCallResult(
    messageId: string,
    toolCallId: string,
  ): Promise<AIToolMessage | null>;
  listToolCallResult(
    messageId: string,
    toolCallIds: string[],
  ): Promise<Map<string, AIToolMessage>>;
}

export interface AgentEventHandler {
  beforeExecution(mode: AgentExecutionMode): Promise<void>;
  afterExecution(
    mode: AgentExecutionMode,
    options?: { aborted?: boolean },
  ): Promise<void>;
}

export interface AgentAbortController {
  registerAbortHandle(token: symbol, handle: AgentAbortHandle): void;
  unregisterAbortHandle(token: symbol): void;
}

export interface ConversationProvider {
  messages: ConversationMessageStore;
  streamCache: LLMStreamCached;
  event: AgentEventHandler;
  abort: AgentAbortController;
}

export interface AgentContextProvider {
  currentConversation(): CurrentConversation;
  resolveLLM(request: AgentRequest): Promise<ResolvedAgentLLM>;
  getSystemPrompt(
    messages: readonly AIMessageInput[],
  ): Promise<string | undefined>;
  discoveredTools(): Promise<DiscoveredTools>;
}

export interface ChatMessageConverter<TSource, TResult> {
  convert(
    source: TSource,
    context: AgentMessageConversionContext,
  ): TResult | Promise<TResult>;
}

export interface ChatMessageConverters {
  formatMessages(
    messages: readonly AIMessageInput[],
    context: AgentMessageConversionContext,
  ): Promise<readonly BaseMessageLike[]>;
  readonly assistant: ChatMessageConverter<
    LangChainAIMessage,
    AIMessageInput | null
  >;
  readonly human: ChatMessageConverter<HumanMessage, AIMessageInput | null>;
  readonly tool: ChatMessageConverter<ToolMessage, AIMessageInput>;
}

export interface AgentAbortHandle {
  readonly signal: AbortSignal;
  abort(reason?: unknown): void;
}

export interface AgentProviders {
  conversation: ConversationProvider;
  context?: AgentContextProvider;
  chatContext?: AgentContextProvider;
  converters: ChatMessageConverters;
  checkpointer?: BaseCheckpointSaver | boolean;
  logger: Logger;
  features: AgentFeatureOptions;
}

export interface CreateAgentProvidersOptions {
  conversation: ConversationProvider;
  context?: AgentContextProvider;
  chatContext?: AgentContextProvider;
  converters?: ChatMessageConverters;
  logger?: Logger;
  features?: Partial<AgentFeatureOptions>;
  checkpointer?: BaseCheckpointSaver | boolean;
}
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
export type AgentConversation = CurrentConversation;
export type AgentExecutionRequest = AgentRequest & {
  executionMode?: 'stream' | 'invoke';
};
export type AgentServiceEvent = AgentStreamEvent;
export type PreparedAgentExecution = PreparedAgentContext & {
  conversation: AgentConversation;
  providerContext?: unknown;
  checkpointer?: unknown;
};
