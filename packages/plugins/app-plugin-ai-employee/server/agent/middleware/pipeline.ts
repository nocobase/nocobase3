import { createMiddleware } from 'langchain';
import type { AgentProviders, PreparedAgentContext } from '../types.js';
import { conversationMiddleware } from './conversation.js';
import { skillToolBindingMiddleware } from './skill-tools.js';
import { toolCallSanitizerMiddleware } from './tool-call-sanitizer.js';
import {
  toolCallStatusMiddleware,
  toolInteractionMiddleware,
} from './tools.js';

const namedNoopMiddleware = (name: string) => createMiddleware({ name });

export function buildStandardAgentMiddleware(
  providers: AgentProviders,
  prepared: PreparedAgentContext,
) {
  const { features } = providers;
  return [
    features.messageNormalization
      ? namedNoopMiddleware('MessageNormalizationMiddleware')
      : namedNoopMiddleware('MessageNormalizationMiddleware'),
    features.contextEnrichment
      ? namedNoopMiddleware('ContextEnrichmentMiddleware')
      : namedNoopMiddleware('ContextEnrichmentMiddleware'),
    features.skills
      ? skillToolBindingMiddleware(providers.tools, {
          baseToolNames: Array.from(prepared.baseToolNames),
        })
      : namedNoopMiddleware('SkillToolBindingMiddleware'),
    features.tools && features.toolInteraction
      ? toolInteractionMiddleware(
          providers.conversation,
          providers.tools,
          prepared.sourceTools,
        )
      : namedNoopMiddleware('ToolInteractionMiddleware'),
    features.tools && features.toolCallStatus
      ? toolCallStatusMiddleware(providers.conversation)
      : namedNoopMiddleware('ToolCallStatusMiddleware'),
    features.conversationPersistence
      ? conversationMiddleware(providers, {
          providerName: prepared.providerName,
          provider: prepared.provider,
          llmService: prepared.llmService,
          model: prepared.model,
          messageId: prepared.metadata.messageId as string | undefined,
          agentThread: prepared.thread,
        })
      : namedNoopMiddleware('ConversationMiddleware'),
    features.toolCallSanitizer
      ? toolCallSanitizerMiddleware({ logger: providers.conversation.logger })
      : namedNoopMiddleware('ToolCallSanitizerMiddleware'),
  ];
}
