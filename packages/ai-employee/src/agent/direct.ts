import type { AIMessageInput } from '../ai-employees/types/index.js';
import type { ToolsEntity } from '../repository/tool.js';
import type { AgentProviderOverrides, ConversationProvider } from './types.js';
import type { LLMProvider } from '../llm-providers/provider.js';
import { createAgentService, type AgentService } from './agent-service.js';
import {
  createAgentProviders,
  createDefaultChatContextProvider,
  createDefaultToolProvider,
  createMemoryConversationProvider,
} from './providers.js';

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
  const overrides: AgentProviderOverrides = {
    ...options.overrides,
    conversation: options.conversationOverrides,
  };
  return createAgentService(
    createAgentProviders({
      llmProvider: options.llmProvider,
      llmIdentity: {
        providerName:
          options.providerName ?? options.llmProvider.constructor.name,
        llmService: options.llmService,
        model:
          options.model ??
          String(options.llmProvider.modelOptions?.model ?? ''),
      },
      conversation,
      chatContext: createDefaultChatContextProvider({
        systemPrompt: options.systemPrompt,
      }),
      tools: createDefaultToolProvider(options.tools),
      overrides,
    }),
  );
}
