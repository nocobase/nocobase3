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
    features.contextEnrichment
      ? namedNoopMiddleware('ContextEnrichmentMiddleware')
      : namedNoopMiddleware('ContextEnrichmentMiddleware'),
    features.skills
      ? skillToolBindingMiddleware(prepared.discoveredTools)
      : namedNoopMiddleware('SkillToolBindingMiddleware'),
    features.tools && features.toolInteraction
      ? toolInteractionMiddleware(
          (providers.context ?? providers.chatContext!).currentConversation(),
          prepared.discoveredTools.tools,
        )
      : namedNoopMiddleware('ToolInteractionMiddleware'),
    features.tools && features.toolCallStatus
      ? toolCallStatusMiddleware(
          providers.conversation,
          (providers.context ?? providers.chatContext!).currentConversation(),
          providers.logger,
        )
      : namedNoopMiddleware('ToolCallStatusMiddleware'),
    features.conversationPersistence
      ? conversationMiddleware(
          providers,
          {
            providerName: prepared.providerName,
            provider: prepared.provider,
            llmService: prepared.llmService,
            model: prepared.model,
            messageId: prepared.metadata.messageId as string | undefined,
            agentThread: prepared.thread,
            toolMap: prepared.discoveredTools.tools,
          },
          providers.logger,
        )
      : namedNoopMiddleware('ConversationMiddleware'),
    features.toolCallSanitizer
      ? toolCallSanitizerMiddleware({ logger: providers.logger })
      : namedNoopMiddleware('ToolCallSanitizerMiddleware'),
  ];
}
