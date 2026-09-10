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
    _request: AgentRequest,
    _llm: ResolvedAgentLLM,
  ): Promise<string | undefined> {
    return Promise.resolve(this.options.systemPrompt);
  }

  public discoveredTools(
    _request: AgentRequest,
  ): Promise<readonly ToolsEntity[]> {
    return Promise.resolve(this.options.tools ?? []);
  }

  public async activeTools(
    request: AgentRequest,
  ): Promise<ReadonlySet<string>> {
    const tools = await this.discoveredTools(request);
    return new Set(tools.map((tool) => tool.definition.name));
  }

  public shouldInterruptToolCall(): boolean {
    return false;
  }

  public isAutoCall(
    _tool: ToolsEntity | undefined,
    _args: unknown,
  ): boolean | Promise<boolean> {
    return false;
  }

  public async getToolsMap(
    request: AgentRequest = {},
  ): Promise<ReadonlyMap<string, ToolsEntity>> {
    const tools = await this.discoveredTools(request);
    return new Map(tools.map((tool) => [tool.definition.name, tool]));
  }
}
