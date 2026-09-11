import type { Logger } from '@nocobase/logging';
import { DefaultChatMessageConverters } from './chat-message-converters.js';
import {
  DEFAULT_AGENT_FEATURES,
  type AgentFeatureOptions,
  type AgentProviders,
  type ConversationProvider,
  type CreateAgentProvidersOptions,
} from './types.js';

class NoopLogger {
  public readonly level = 'silent';

  public fatal(): void {}
  public error(): void {}
  public warn(): void {}
  public info(): void {}
  public debug(): void {}
  public trace(): void {}
  public silent(): void {}
  public child(): NoopLogger {
    return this;
  }
  public bindings(): Record<string, never> {
    return {};
  }
  public flush(): void {}
  public isLevelEnabled(): boolean {
    return false;
  }
}

const noopLogger = new NoopLogger() as unknown as Logger;

class DefaultAgentProviders implements AgentProviders {
  public readonly conversation: ConversationProvider;
  public readonly chatContext: AgentProviders['chatContext'];
  public readonly chatMessageConverters: AgentProviders['chatMessageConverters'];
  public readonly logger: Logger;
  public readonly features: AgentFeatureOptions;
  public readonly checkpointer: AgentProviders['checkpointer'];

  public constructor(options: CreateAgentProvidersOptions) {
    this.conversation = options.conversation;
    this.chatContext = options.chatContext;
    this.logger = options.logger ?? noopLogger;
    this.chatMessageConverters =
      options.chatMessageConverters ?? new DefaultChatMessageConverters();
    this.features = {
      ...DEFAULT_AGENT_FEATURES,
      ...(options.features ?? {}),
    };
    this.checkpointer = options.checkpointer;
  }
}

/** @deprecated Construct a DefaultChatMessageConverters directly. */
export const createDefaultChatMessageConverters =
  (): DefaultChatMessageConverters => new DefaultChatMessageConverters();

export function createAgentProviders(
  options: CreateAgentProvidersOptions,
): AgentProviders {
  return new DefaultAgentProviders(options);
}
