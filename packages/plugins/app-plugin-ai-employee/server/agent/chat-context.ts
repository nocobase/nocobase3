import type { LLMProvider, ToolsEntity } from '@nocobase/ai-employee';
import type {
  AgentRequest,
  ChatContextProvider,
  ResolvedAgentLLM,
} from './types.js';

export interface AgentLLMResolver {
  resolve(request: AgentRequest): Promise<ResolvedAgentLLM>;
}

export interface FixedLLMResolverOptions {
  readonly provider: LLMProvider;
  readonly providerName?: string;
  readonly llmService?: string;
  readonly model?: string;
}

export function createFixedLLMResolver(
  options: FixedLLMResolverOptions,
): AgentLLMResolver {
  return {
    resolve: async () => ({
      providerName: options.providerName ?? options.provider.constructor.name,
      llmService: options.llmService,
      model:
        options.model ?? String(options.provider.modelOptions?.model ?? ''),
      provider: options.provider,
    }),
  };
}

export interface BaseChatContextProviderOptions {
  readonly llmResolver: AgentLLMResolver;
  readonly tools?: readonly ToolsEntity[];
  readonly systemPrompt?: string;
  readonly executionConfig?: (
    request: AgentRequest,
    llm: ResolvedAgentLLM,
  ) => Promise<Record<string, unknown>>;
}

export class BaseChatContextProvider implements ChatContextProvider {
  public constructor(
    protected readonly options: BaseChatContextProviderOptions,
  ) {}

  public resolveLLM(request: AgentRequest): Promise<ResolvedAgentLLM> {
    return this.options.llmResolver.resolve(request);
  }

  public getSystemPrompt(
    _messages: readonly import('@nocobase/ai-employee').AIMessageInput[],
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

  public getExecutionConfig(
    request: AgentRequest,
    llm: ResolvedAgentLLM,
  ): Promise<Record<string, unknown>> {
    return this.options.executionConfig?.(request, llm) ?? Promise.resolve({});
  }

  public shouldInterruptToolCall(): boolean {
    return false;
  }

  public async getToolsMap(
    request: AgentRequest,
  ): Promise<ReadonlyMap<string, ToolsEntity>> {
    const tools = await this.discoveredTools(request);
    return new Map(tools.map((tool) => [tool.definition.name, tool]));
  }
}
