import type { AIMessageInput } from '@nocobase/ai-employee';
import type { ToolsEntity } from '@nocobase/ai-employee';
import type { ConversationProvider, CurrentConversation } from './types.js';
import type { LLMProvider } from '@nocobase/ai-employee';
import { createAgentService, type AgentService } from './agent-service.js';
import {
  createAgentProviders,
  createMemoryConversationProvider,
} from './providers.js';
import { FixedChatContextProvider } from './chat-context.js';
import { DefaultChatMessageConverters } from './chat-message-converters.js';

export interface CreateDirectAgentServiceOptions {
  llmProvider: LLMProvider;
  providerName?: string;
  llmService?: string;
  model?: string;
  systemPrompt?: string;
  messages?: AIMessageInput[];
  tools?: ToolsEntity[];
  conversation?: ConversationProvider;
  currentConversation?: CurrentConversation;
}

export function createDirectAgentService(
  options: CreateDirectAgentServiceOptions,
): AgentService {
  const currentConversation = options.currentConversation ?? {
    sessionId: `agent-${crypto.randomUUID()}`,
  };
  const conversation =
    options.conversation ??
    createMemoryConversationProvider({
      currentConversation,
      initialMessages: options.messages,
    });
  const chatMessageConverters = new DefaultChatMessageConverters();
  const chatContext = new FixedChatContextProvider({
    currentConversation,
    provider: options.llmProvider,
    providerName: options.providerName,
    llmService: options.llmService,
    model: options.model,
    systemPrompt: options.systemPrompt,
    tools: options.tools,
  });
  return createAgentService(
    createAgentProviders({
      conversation,
      chatContext,
      chatMessageConverters,
    }),
  );
}
