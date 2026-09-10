import type {
  AIMessageInput,
  LLMProvider,
  ToolsEntity,
} from '@nocobase/ai-employee';
import type {
  AgentRequest,
  ChatContextProvider,
  ResolvedAgentLLM,
} from './types.js';

export interface FixedChatContextProviderOptions {
  readonly provider: LLMProvider;
  readonly providerName?: string;
  readonly llmService?: string;
  readonly model?: string;
  readonly tools?: readonly ToolsEntity[];
  readonly systemPrompt?: string;
}

export class FixedChatContextProvider implements ChatContextProvider {
  public constructor(
    private readonly options: FixedChatContextProviderOptions,
  ) {}

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

  public discoveredTools(): Promise<ReadonlyMap<string, ToolsEntity>> {
    return Promise.resolve(
      new Map(
        (this.options.tools ?? []).map((tool) => [tool.definition.name, tool]),
      ),
    );
  }

  public async activeTools(): Promise<ReadonlySet<string>> {
    return new Set((await this.discoveredTools()).keys());
  }
}
