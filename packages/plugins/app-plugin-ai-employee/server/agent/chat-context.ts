import type {
  AIMessageInput,
  LLMProvider,
  ToolsEntity,
} from '@nocobase/ai-employee';
import type {
  AgentRequest,
  ChatContextProvider,
  CurrentConversation,
  DiscoveredTools,
  ResolvedAgentLLM,
} from './types.js';

export interface FixedChatContextProviderOptions {
  readonly currentConversation?: CurrentConversation;
  readonly provider: LLMProvider;
  readonly providerName?: string;
  readonly llmService?: string;
  readonly model?: string;
  readonly tools?: readonly ToolsEntity[];
  readonly systemPrompt?: string;
}

export class FixedChatContextProvider implements ChatContextProvider {
  private readonly conversation: CurrentConversation;

  public constructor(
    private readonly options: FixedChatContextProviderOptions,
  ) {
    this.conversation = options.currentConversation ?? {
      sessionId: `agent-${crypto.randomUUID()}`,
    };
  }

  public currentConversation(): CurrentConversation {
    return this.conversation;
  }

  public resolveLLM(_request: AgentRequest): Promise<ResolvedAgentLLM> {
    return Promise.resolve({
      providerName:
        this.options.providerName ?? this.options.provider.constructor.name,
      llmService: this.options.llmService,
      model:
        this.options.model ??
        String(this.options.provider.modelOptions?.model ?? ''),
      provider: this.options.provider,
    });
  }

  public getSystemPrompt(
    _messages: readonly AIMessageInput[],
  ): Promise<string | undefined> {
    return Promise.resolve(this.options.systemPrompt);
  }

  public discoveredTools(): Promise<DiscoveredTools> {
    const tools = new Map(
      (this.options.tools ?? []).map((tool) => [tool.definition.name, tool]),
    );
    return Promise.resolve({
      tools,
      activeTools: () => Promise.resolve(new Set(tools.keys())),
    });
  }
}
