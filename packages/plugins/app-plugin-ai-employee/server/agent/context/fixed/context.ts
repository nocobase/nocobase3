import type {
  AgentState,
  AIMessageInput,
  ToolsEntity,
  LLMProvider,
} from '@nocobase/ai-employee';
import type {
  AgentContextProvider,
  CurrentConversation,
  DiscoveredTools,
  ResolvedAgentLLM,
} from '../../types.js';
import type { ModelRef } from '../../../types.js';

export interface FixedAgentContextOptions {
  readonly sessionId: string;
  readonly username?: string;
  readonly from?: string;
  readonly model?: ModelRef;
  readonly provider?: LLMProvider;
  readonly providerName?: string;
  readonly llmService?: string;
  readonly systemPrompt?: string;
  readonly tools?: ReadonlyMap<string, ToolsEntity>;
  readonly activeTools?: ReadonlySet<string>;
  readonly toolRuntimeContext?: { state: AgentState };
}

export class FixedAgentContextProvider implements AgentContextProvider {
  private readonly conversation: CurrentConversation;
  private readonly model?: ModelRef;
  private readonly provider?: LLMProvider;
  private readonly providerName?: string;
  private readonly llmService?: string;
  private readonly prompt?: string;
  private readonly tools: ReadonlyMap<string, ToolsEntity>;
  private readonly activeToolNames: ReadonlySet<string>;
  private readonly runtimeContext?: { state: AgentState };
  public constructor(options: FixedAgentContextOptions) {
    this.conversation = {
      sessionId: options.sessionId,
      username: options.username,
      from: options.from,
    };
    this.model = options.model;
    this.provider = options.provider;
    this.providerName = options.providerName;
    this.llmService = options.llmService;
    this.prompt = options.systemPrompt;
    this.tools = options.tools ?? new Map();
    this.activeToolNames = options.activeTools ?? new Set(this.tools.keys());
    this.runtimeContext = options.toolRuntimeContext;
  }

  public currentConversation(): CurrentConversation {
    return this.conversation;
  }

  public toolRuntimeContext(): unknown {
    return this.runtimeContext;
  }

  public state(): AgentState {
    return (
      this.runtimeContext?.state ?? { sessionId: this.conversation.sessionId }
    );
  }

  public async resolveLLM(): Promise<ResolvedAgentLLM> {
    const model = this.model;
    if (!model) throw new Error('Fixed agent model is required');
    if (!this.provider)
      throw new Error('Fixed agent model provider is required');
    return {
      providerName: this.providerName ?? '',
      llmService: this.llmService ?? model.llmService,
      model: model.model,
      provider: this.provider,
    };
  }

  public async getSystemPrompt(
    _userMessages: readonly AIMessageInput[],
  ): Promise<string | undefined> {
    return this.prompt;
  }

  public async discoveredTools(): Promise<DiscoveredTools> {
    return { tools: this.tools, activeTools: async () => this.activeToolNames };
  }
}
