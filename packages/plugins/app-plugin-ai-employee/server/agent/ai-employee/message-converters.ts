import type { BaseMessageLike } from '@langchain/core/messages';
import type {
  AIMessage as LangChainAIMessage,
  HumanMessage,
  ToolMessage,
} from 'langchain';
import type {
  AIMessageContent,
  AIMessageInput,
  LLMProvider,
} from '@nocobase/ai-employee';
import type { Logger } from '@nocobase/logging';
import { BaseChatMessageConverters } from '../chat-message-converters.js';
import type { AgentMessageConversionContext } from '../types.js';
import { resolveMessageAttachments } from './attachments.js';
import { sanitizeAdditionalKwargsForToolCalls } from './tool-call-sanitizer.js';
import type { AIEmployeeAgentOptions } from './options.js';

const toStoredAssistantMessage = ({
  aiEmployee,
  providerName: provider,
  provider: providerInstance,
  llmService,
  model,
  aiMessage,
}: {
  aiEmployee: {
    employee: { username?: string; get?: (name: string) => unknown };
    skillSettings?: Record<string, any>;
    logger?: Logger;
  };
  providerName: string;
  provider: LLMProvider;
  llmService?: string;
  model: string;
  aiMessage: LangChainAIMessage;
}): AIMessageInput | null => {
  const message = aiMessage.content;
  const toolCalls = aiMessage.tool_calls;
  const tools = aiEmployee.skillSettings?.tools;

  if (message == null && !toolCalls?.length) {
    return null;
  }

  // Extract text content and references from array content (e.g., Anthropic web search response)
  let textContent: any = message;
  let reference: { title: string; url: string }[] | undefined;

  if (Array.isArray(message)) {
    const textBlocks = message.filter((block: any) => block.type === 'text');
    textContent = textBlocks.map((block: any) => block.text).join('') || '';

    for (const block of message) {
      if (
        block.type === 'web_search_tool_result' &&
        Array.isArray(block.content)
      ) {
        reference = reference || [];
        for (const item of block.content) {
          if (item.type === 'web_search_result' && item.url) {
            reference.push({ title: item.title || '', url: item.url });
          }
        }
      }
    }
  }

  const values: AIMessageInput = {
    role: String(
      aiEmployee.employee.username ??
        aiEmployee.employee.get?.('username') ??
        '',
    ),
    content: {
      type: 'text',
      content: textContent,
      ...(reference?.length ? { reference } : {}),
    },
    metadata: {
      id: aiMessage.id,
      model,
      provider,
      llmService,
      usage_metadata: {},
    },
  };

  if (toolCalls?.length) {
    values.toolCalls = toolCalls as any;
    values.metadata.autoCallTools = toolCalls
      .filter((tool: { name: string }) => {
        return tools?.some(
          (s: { name: string; autoCall?: boolean }) =>
            s.name === tool.name && s.autoCall,
        );
      })
      .map((tool: { name: string }) => tool.name);
  }

  if (aiMessage.usage_metadata) {
    values.metadata.usage_metadata = aiMessage.usage_metadata;
  }
  if (aiMessage.response_metadata) {
    values.metadata.response_metadata = aiMessage.response_metadata;
  }
  const sanitizedToolCalls = sanitizeAdditionalKwargsForToolCalls(
    aiMessage.additional_kwargs,
    toolCalls,
    {
      onDiscard: (info) => {
        aiEmployee.logger?.warn(
          {
            phase: 'toStoredAssistantMessage',
            messageId: aiMessage.id,
            invalidToolCallCount: aiMessage.invalid_tool_calls?.length ?? 0,
            ...info,
          },
          'Discard malformed raw tool calls from AI message',
        );
      },
    },
  );
  const additionalKwargs = sanitizedToolCalls.additionalKwargs;
  if (additionalKwargs) {
    values.metadata.additional_kwargs = additionalKwargs;
  }
  if (sanitizedToolCalls.malformedToolCalls?.length) {
    values.metadata.diagnostics = {
      malformedToolCalls: sanitizedToolCalls.malformedToolCalls,
    };
  }

  providerInstance.reshapeAIMessage({ aiMessage, values });

  return values;
};

const toStoredHumanMessage = ({
  providerName: provider,
  llmService,
  model,
  humanMessage,
}: {
  providerName: string;
  llmService?: string;
  model: string;
  humanMessage: HumanMessage;
}): AIMessageInput | null => {
  if (!humanMessage.additional_kwargs.userContent) {
    return null;
  }

  const values: AIMessageInput = {
    role: 'user',
    content: humanMessage.additional_kwargs?.userContent as AIMessageContent,
    metadata: {
      id: humanMessage.id,
      model,
      provider,
      llmService,
    },
  };

  values.attachments = humanMessage.additional_kwargs.attachments as any;
  values.workContext = humanMessage.additional_kwargs.workContext as any;

  return values;
};

const toStoredToolMessage = ({
  providerName: provider,
  llmService,
  model,
  toolMessage,
}: {
  providerName: string;
  llmService?: string;
  model: string;
  toolMessage: ToolMessage;
}): AIMessageInput => {
  const values: AIMessageInput = {
    role: 'tool',
    content: {
      type: 'text',
      content: toolMessage.content,
    },
    metadata: {
      id: toolMessage.id,
      model,
      provider,
      llmService,
      toolCallId: toolMessage.tool_call_id,
      toolName: toolMessage.name,
    },
  };

  return values;
};

export class AIEmployeeChatMessageConverters extends BaseChatMessageConverters {
  public constructor(private readonly aiOptions: AIEmployeeAgentOptions) {
    super({
      assistantRole: String(aiOptions.employee.username ?? ''),
      logger: aiOptions.agentContext.logger,
    });
    this.assistant = {
      toStored: (message: LangChainAIMessage, context) =>
        toStoredAssistantMessage({
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
        toStoredHumanMessage({
          providerName: context.providerName,
          llmService: context.llmService,
          model: context.model,
          humanMessage: message,
        }),
    };
    this.tool = {
      toStored: (message: ToolMessage, context) =>
        toStoredToolMessage({
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
