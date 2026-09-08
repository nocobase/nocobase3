import {
  AIMessage,
  HumanMessage,
  ToolMessage,
  type BaseMessageLike,
} from '@langchain/core/messages';
import type {
  AIMessageContent,
  AIMessageInput,
  AIToolCall,
} from '@nocobase/ai-employee';
import type { Logger } from '@nocobase/logging';
import type {
  AgentMessageConversionContext,
  ChatMessageConverters,
} from './types.js';

export interface BaseChatMessageConvertersOptions {
  readonly assistantRole?: string;
  readonly logger?: Logger;
  readonly formatMessages?: (
    messages: readonly AIMessageInput[],
    context: AgentMessageConversionContext,
  ) => Promise<readonly BaseMessageLike[]>;
}

export class BaseChatMessageConverters implements ChatMessageConverters {
  public readonly assistant: ChatMessageConverters['assistant'];
  public readonly human: ChatMessageConverters['human'];
  public readonly tool: ChatMessageConverters['tool'];

  public constructor(
    protected readonly options: BaseChatMessageConvertersOptions = {},
  ) {
    this.assistant = {
      toStored: (message, context) => {
        const emptyContent =
          message.content == null ||
          message.content === '' ||
          (Array.isArray(message.content) && message.content.length === 0);
        if (emptyContent && !message.tool_calls?.length) return null;
        return {
          role: this.options.assistantRole ?? 'assistant',
          content: { type: 'text', content: message.content },
          toolCalls: message.tool_calls as AIToolCall[],
          metadata: {
            id: message.id,
            provider: context.providerName,
            llmService: context.llmService,
            model: context.model,
            usage_metadata: message.usage_metadata ?? {},
            response_metadata: message.response_metadata,
            additional_kwargs:
              context.provider.prepareStoredAssistantAdditionalKwargs(
                message.additional_kwargs,
              ),
          },
        } as AIMessageInput;
      },
    };
    this.human = {
      toStored: (message, context) => {
        const userContent = message.additional_kwargs.userContent;
        if (!userContent) return null;
        return {
          role: 'user',
          content: userContent as AIMessageContent,
          attachments: message.additional_kwargs.attachments as never,
          workContext: message.additional_kwargs.workContext as never,
          metadata: {
            id: message.id,
            provider: context.providerName,
            llmService: context.llmService,
            model: context.model,
          },
        } as AIMessageInput;
      },
    };
    this.tool = {
      toStored: (message, context) => ({
        role: 'tool',
        content: { type: 'text', content: message.content },
        metadata: {
          id: message.id,
          provider: context.providerName,
          llmService: context.llmService,
          model: context.model,
          toolCallId: message.tool_call_id,
          toolName: message.name,
        },
      }),
    };
  }

  public formatMessages(
    messages: readonly AIMessageInput[],
    context: AgentMessageConversionContext,
  ): Promise<readonly BaseMessageLike[]> {
    if (this.options.formatMessages) {
      return this.options.formatMessages(messages, context);
    }
    return Promise.resolve(
      messages.map((message): BaseMessageLike => {
        const rawContent = message.content?.content ?? '';
        const content = rawContent as never;
        if (message.role === 'user') {
          return new HumanMessage({
            content,
            additional_kwargs: {
              userContent: message.content,
              attachments: message.attachments,
              workContext: message.workContext,
            },
          });
        }
        if (message.role === 'tool') {
          return new ToolMessage({
            content,
            tool_call_id: String(message.metadata?.toolCallId ?? ''),
            name: String(message.metadata?.toolName ?? ''),
          });
        }
        if (message.role === 'system') return { role: 'system', content };
        return new AIMessage({
          content,
          tool_calls: message.toolCalls as never,
          response_metadata: message.metadata?.response_metadata,
          additional_kwargs:
            context.provider.prepareStoredAssistantAdditionalKwargs(
              message.metadata?.additional_kwargs ?? {},
            ),
        });
      }),
    );
  }
}
