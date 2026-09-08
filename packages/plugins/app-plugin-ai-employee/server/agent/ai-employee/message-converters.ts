import type { BaseMessageLike } from '@langchain/core/messages';
import type {
  AIMessage as LangChainAIMessage,
  HumanMessage,
  ToolMessage,
} from 'langchain';
import type { AIMessageInput } from '@nocobase/ai-employee';
import { BaseChatMessageConverters } from '../chat-message-converters.js';
import type { AgentMessageConversionContext } from '../types.js';
import { resolveMessageAttachments } from './attachments.js';
import { sanitizeAdditionalKwargsForToolCalls } from './tool-call-sanitizer.js';
import {
  convertAIMessage,
  convertHumanMessage,
  convertToolMessage,
} from './utils.js';
import type { AIEmployeeAgentRuntimeOptions } from './runtime.js';

export class AIEmployeeChatMessageConverters extends BaseChatMessageConverters {
  public constructor(
    private readonly aiOptions: AIEmployeeAgentRuntimeOptions,
  ) {
    super({
      assistantRole: String(aiOptions.employee.username ?? ''),
      logger: aiOptions.agentContext.logger,
    });
    this.assistant = {
      toStored: (message: LangChainAIMessage, context) =>
        convertAIMessage({
          aiEmployee: {
            employee: aiOptions.employee,
            skillSettings: aiOptions.skillSettings,
            logger: aiOptions.agentContext.logger,
          },
          providerName: context.providerName,
          provider: context.provider,
          llmService: context.llmService,
          model: context.model,
          aiMessage: message,
        }),
    };
    this.human = {
      toStored: (message: HumanMessage, context) =>
        convertHumanMessage({
          providerName: context.providerName,
          llmService: context.llmService,
          model: context.model,
          humanMessage: message,
        }),
    };
    this.tool = {
      toStored: (message: ToolMessage, context) =>
        convertToolMessage({
          providerName: context.providerName,
          llmService: context.llmService,
          model: context.model,
          toolMessage: message,
        }),
    };
  }

  public override async formatMessages(
    messages: readonly AIMessageInput[],
    context: AgentMessageConversionContext,
  ): Promise<readonly BaseMessageLike[]> {
    const formattedMessages: BaseMessageLike[] = [];
    const resolvedMessages = await resolveMessageAttachments({
      actorId: this.aiOptions.agentContext.actor.id,
      repositories: this.aiOptions.repositories,
      messages: [...messages],
    });
    const truncate = (text: string, maxLen = 50000): string =>
      !text || text.length <= maxLen
        ? text
        : `${text.slice(0, maxLen)}\n...[truncated]`;

    for (const message of resolvedMessages) {
      const attachments = message.attachments;
      const workContext = message.workContext;
      const userContent = message.content;
      let content = userContent?.content;
      if (Array.isArray(content)) {
        content =
          content
            .filter((block: any) => block.type === 'text')
            .map((block: any) => block.text)
            .join('') || '';
      }
      if (typeof content === 'string') content = truncate(content);

      if (message.role === 'user') {
        if (typeof content === 'string') {
          content = `<user_query>${content}</user_query>`;
          if (workContext?.length) {
            const resolved =
              await this.aiOptions.workContextHandler.resolve(workContext);
            content = `${resolved.map((value) => `<work_context>${value}</work_context>`).join('\n')}\n${content}`;
          }
        }
        const contentBlocks: any[] = [];
        for (const attachment of attachments ?? []) {
          const parsed = await context.provider.parseAttachment(
            attachment as any,
            {
              fileStorage: this.aiOptions.fileStorage,
              documentLoader: this.aiOptions.documentLoaders.cached,
              caching: this.aiOptions.caching,
              getHeader: this.aiOptions.getHeader ?? (() => undefined),
            },
          );
          if (parsed.placement === 'system') {
            formattedMessages.push({ role: 'system', content: parsed.content });
          } else {
            contentBlocks.push(parsed.content);
          }
        }
        if (content && contentBlocks.length) {
          contentBlocks.push({ type: 'text', text: content });
        }
        const additional_kwargs = { userContent, attachments, workContext };
        formattedMessages.push(
          contentBlocks.length
            ? ({
                role: 'user',
                additional_kwargs,
                contentBlocks,
              } as unknown as BaseMessageLike)
            : ({
                role: 'user',
                additional_kwargs,
                content,
              } as BaseMessageLike),
        );
        continue;
      }

      if (message.role === 'tool') {
        formattedMessages.push({
          role: 'tool',
          content: content as any,
          tool_call_id: String(message.metadata?.toolCallId ?? ''),
        });
        continue;
      }

      const additionalKwargs = sanitizeAdditionalKwargsForToolCalls(
        message.metadata?.additional_kwargs,
        message.toolCalls,
        {
          onDiscard: (info) =>
            this.aiOptions.agentContext.logger.warn(
              {
                phase: 'formatMessages',
                messageId: message.metadata?.id,
                ...info,
              },
              'Discard malformed raw tool calls from AI message',
            ),
        },
      ).additionalKwargs;
      formattedMessages.push({
        role: 'assistant',
        content: content as any,
        tool_calls: message.toolCalls,
        response_metadata: message.metadata?.response_metadata,
        additional_kwargs:
          context.provider.prepareStoredAssistantAdditionalKwargs(
            additionalKwargs,
          ),
      } as BaseMessageLike);
    }
    return formattedMessages;
  }
}
