import type { AIMessageInput } from '@nocobase/ai-employee';
import type { ToolsEntity } from '@nocobase/ai-employee';
import type { AgentProviderOverrides, ConversationProvider } from './types.js';
import type { LLMProvider } from '@nocobase/ai-employee';
import { createAgentService, type AgentService } from './agent-service.js';
import {
  createAgentProviders,
  createDefaultToolProvider,
  createMemoryConversationProvider,
} from './providers.js';
import {
  BaseChatContextProvider,
  createFixedLLMResolver,
} from './chat-context.js';
import { BaseChatMessageConverters } from './chat-message-converters.js';

class DirectChatContextProvider extends BaseChatContextProvider {
  public constructor(
    options: ConstructorParameters<typeof BaseChatContextProvider>[0],
    private readonly converters: BaseChatMessageConverters,
    private readonly conversionContext: {
      providerName: string;
      llmService?: string;
      model: string;
      provider: LLMProvider;
    },
  ) {
    super(options);
  }

  public formatMessages(messages: readonly AIMessageInput[]) {
    return this.converters.formatMessages(messages, this.conversionContext);
  }

  public convertAIMessage(message: any) {
    return this.converters.assistant.toStored(message, this.conversionContext);
  }

  public convertHumanMessage(message: any) {
    return this.converters.human.toStored(message, this.conversionContext);
  }

  public convertToolMessage(message: any) {
    return this.converters.tool.toStored(message, this.conversionContext);
  }
}

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
  const conversionContext = {
    providerName,
    llmService: options.llmService,
    model,
    provider: options.llmProvider,
  };
  const chatMessageConverters = new BaseChatMessageConverters();
  const chatContext = new DirectChatContextProvider(
    {
      llmResolver: createFixedLLMResolver({
        provider: options.llmProvider,
        providerName,
        llmService: options.llmService,
        model,
      }),
      systemPrompt: options.systemPrompt,
      tools: options.tools,
    },
    chatMessageConverters,
    conversionContext,
  );
  const overrides: AgentProviderOverrides = {
    ...options.overrides,
    conversation: options.conversationOverrides,
  };
  return createAgentService(
    createAgentProviders({
      llmProvider: options.llmProvider,
      llmIdentity: {
        providerName,
        llmService: options.llmService,
        model,
      },
      conversation,
      chatContext,
      chatMessageConverters,
      tools: createDefaultToolProvider(options.tools),
      overrides,
    }),
  );
}
