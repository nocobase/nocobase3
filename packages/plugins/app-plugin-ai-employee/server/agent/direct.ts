import type { AIMessageInput } from '@nocobase/ai-employee';
import type { ToolsEntity } from '@nocobase/ai-employee';
import type { AgentProviderOverrides, ConversationProvider } from './types.js';
import type { LLMProvider } from '@nocobase/ai-employee';
import { createAgentService, type AgentService } from './agent-service.js';
import {
  createAgentProviders,
  createMemoryConversationProvider,
} from './providers.js';
import {
  BaseChatContextProvider,
  createFixedLLMResolver,
} from './chat-context.js';
import { BaseChatMessageConverters } from './chat-message-converters.js';

export interface CreateDirectAgentServiceOptions {
  llmProvider: LLMProvider;
  providerName?: string;
  llmService?: string;
  model?: string;
  systemPrompt?: string;
  messages?: AIMessageInput[];
  tools?: ToolsEntity[];
  conversation?: ConversationProvider;
  conversationOverrides?: AgentProviderOverrides['conversation'];
  overrides?: Omit<AgentProviderOverrides, 'conversation'>;
}

export function createDirectAgentService(
  options: CreateDirectAgentServiceOptions,
): AgentService {
  const conversation =
    options.conversation ??
    createMemoryConversationProvider({ initialMessages: options.messages });
  const providerName =
    options.providerName ?? options.llmProvider.constructor.name;
  const model =
    options.model ?? String(options.llmProvider.modelOptions?.model ?? '');
  const chatMessageConverters = new BaseChatMessageConverters();
  const chatContext = new BaseChatContextProvider({
    llmResolver: createFixedLLMResolver({
      provider: options.llmProvider,
      providerName,
      llmService: options.llmService,
      model,
    }),
    systemPrompt: options.systemPrompt,
    tools: options.tools,
  });
  const overrides: AgentProviderOverrides = {
    ...options.overrides,
    conversation: options.conversationOverrides,
  };
  return createAgentService(
    createAgentProviders({
      conversation,
      chatContext,
      chatMessageConverters,
      overrides,
    }),
  );
}
