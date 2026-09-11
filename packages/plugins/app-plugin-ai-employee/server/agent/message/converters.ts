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
import type { Caching } from '@nocobase/caching';
import type { DocumentLoaders, FileStorage } from '@nocobase/ai-employee';
import type { CollectionRepositoryResolver } from '../context/ai-employee/attachments.js';
import type { WorkContextHandler } from '../../manager/work-context/index.js';
import type {
  AIMessage as LangChainAIMessage,
  HumanMessage as LangChainHumanMessage,
  ToolMessage as LangChainToolMessage,
} from 'langchain';
import type {
  AgentMessageConversionContext,
  ChatMessageConverter,
  ChatMessageConverters,
} from '../types.js';
import { resolveMessageAttachments } from '../context/ai-employee/attachments.js';
import { sanitizeAdditionalKwargsForToolCalls } from '../context/ai-employee/tool-call-sanitizer.js';

export interface ChatMessageConvertersOptions {
  readonly assistantRole?: string;
  readonly formatMessages?: (
    messages: readonly AIMessageInput[],
    context: AgentMessageConversionContext,
  ) => Promise<readonly BaseMessageLike[]>;
}

class StoredAssistantChatMessageConverter implements ChatMessageConverter<
  LangChainAIMessage,
  AIMessageInput | null
> {
  public constructor(private readonly assistantRole?: string) {}

  public convert(
    message: LangChainAIMessage,
    context: AgentMessageConversionContext,
  ): AIMessageInput | null {
    const emptyContent =
      message.content == null ||
      message.content === '' ||
      (Array.isArray(message.content) && message.content.length === 0);
    if (emptyContent && !message.tool_calls?.length) return null;
    return {
      role: this.assistantRole ?? 'assistant',
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
  }
}

class StoredHumanChatMessageConverter implements ChatMessageConverter<
  LangChainHumanMessage,
  AIMessageInput | null
> {
  public convert(
    message: LangChainHumanMessage,
    context: AgentMessageConversionContext,
  ): AIMessageInput | null {
    const userContent = message.additional_kwargs?.userContent;
    if (!userContent) return null;
    return {
      role: 'user',
      content: userContent as AIMessageContent,
      attachments: message.additional_kwargs?.attachments as never,
      workContext: message.additional_kwargs?.workContext as never,
      metadata: {
        id: message.id,
        provider: context.providerName,
        llmService: context.llmService,
        model: context.model,
      },
    } as AIMessageInput;
  }
}

class StoredToolMessageConverter implements ChatMessageConverter<
  LangChainToolMessage,
  AIMessageInput
> {
  public convert(
    message: LangChainToolMessage,
    context: AgentMessageConversionContext,
  ): AIMessageInput {
    return {
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
    };
  }
}

class DefaultAssistantChatMessageConverter implements ChatMessageConverter<
  LangChainAIMessage,
  AIMessageInput | null
> {
  public constructor(
    private readonly aiEmployee: {
      employee: { username?: string; get?: (name: string) => unknown };
      skillSettings?: Record<string, any>;
      logger?: Logger;
    },
  ) {}

  public convert(
    aiMessage: LangChainAIMessage,
    context: AgentMessageConversionContext,
  ): AIMessageInput | null {
    const {
      providerName: provider,
      provider: providerInstance,
      llmService,
      model,
    } = context;
    const aiEmployee = this.aiEmployee;
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
              phase: 'convertAssistantMessage',
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
  }
}

class DefaultHumanChatMessageConverter implements ChatMessageConverter<
  LangChainHumanMessage,
  AIMessageInput | null
> {
  public convert(
    humanMessage: LangChainHumanMessage,
    context: AgentMessageConversionContext,
  ): AIMessageInput | null {
    const { providerName: provider, llmService, model } = context;
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
  }
}

class DefaultToolMessageConverter implements ChatMessageConverter<
  LangChainToolMessage,
  AIMessageInput
> {
  public convert(
    toolMessage: LangChainToolMessage,
    context: AgentMessageConversionContext,
  ): AIMessageInput {
    const { providerName: provider, llmService, model } = context;
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
  }
}

class DefaultMessageConverters implements ChatMessageConverters {
  public readonly assistant: ChatMessageConverters['assistant'];
  public readonly human: ChatMessageConverters['human'];
  public readonly tool: ChatMessageConverters['tool'];

  public constructor(
    private readonly employeeOptions: AIEmployeeMessageConverterOptions,
  ) {
    this.assistant = new DefaultAssistantChatMessageConverter({
      employee: employeeOptions.employee,
      skillSettings: employeeOptions.skillSettings,
      logger: employeeOptions.logger,
    });
    this.human = new DefaultHumanChatMessageConverter();
    this.tool = new DefaultToolMessageConverter();
  }

  public async formatMessages(
    messages: readonly AIMessageInput[],
    context: AgentMessageConversionContext,
  ): Promise<readonly BaseMessageLike[]> {
    const formattedMessages: BaseMessageLike[] = [];
    const resolvedMessages = await resolveMessageAttachments({
      actorId: this.employeeOptions.actorId,
      collectionRepository: this.employeeOptions.collectionRepository,
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
              await this.employeeOptions.workContextHandler.resolve(
                workContext,
              );
            content = `${resolved.map((value) => `<work_context>${value}</work_context>`).join('\n')}\n${content}`;
          }
        }
        const contentBlocks: any[] = [];
        for (const attachment of attachments ?? []) {
          const parsed = await context.provider.parseAttachment(
            attachment as any,
            {
              fileStorage: this.employeeOptions.fileStorage,
              documentLoader: this.employeeOptions.documentLoaders.cached,
              caching: this.employeeOptions.caching,
              getHeader: this.employeeOptions.getHeader ?? (() => undefined),
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
            this.employeeOptions.logger?.warn(
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

export interface AIEmployeeMessageConverterOptions {
  readonly employee: { username?: string; get?: (name: string) => unknown };
  readonly skillSettings?: Record<string, any>;
  readonly logger?: Logger;
  readonly actorId: string | number;
  readonly collectionRepository: CollectionRepositoryResolver;
  readonly workContextHandler: WorkContextHandler;
  readonly fileStorage: FileStorage<any, any>;
  readonly documentLoaders: DocumentLoaders;
  readonly caching: Caching;
  readonly getHeader?: (name: string) => string | undefined;
}

function isAIEmployeeAgentOptions(
  options: ChatMessageConvertersOptions | AIEmployeeMessageConverterOptions,
): options is AIEmployeeMessageConverterOptions {
  return 'employee' in options && 'actorId' in options;
}

export class DefaultChatMessageConverters implements ChatMessageConverters {
  public readonly assistant: ChatMessageConverters['assistant'];
  public readonly human: ChatMessageConverters['human'];
  public readonly tool: ChatMessageConverters['tool'];

  private readonly options: ChatMessageConvertersOptions;
  private readonly aiEmployeeConverters?: DefaultMessageConverters;

  public constructor(
    options:
      ChatMessageConvertersOptions | AIEmployeeMessageConverterOptions = {},
  ) {
    if (isAIEmployeeAgentOptions(options)) {
      this.options = {};
      this.aiEmployeeConverters = new DefaultMessageConverters(options);
      this.assistant = this.aiEmployeeConverters.assistant;
      this.human = this.aiEmployeeConverters.human;
      this.tool = this.aiEmployeeConverters.tool;
      return;
    }
    this.options = options;
    this.assistant = new StoredAssistantChatMessageConverter(
      options.assistantRole,
    );
    this.human = new StoredHumanChatMessageConverter();
    this.tool = new StoredToolMessageConverter();
  }

  public formatMessages(
    messages: readonly AIMessageInput[],
    context: AgentMessageConversionContext,
  ): Promise<readonly BaseMessageLike[]> {
    if (this.aiEmployeeConverters) {
      return this.aiEmployeeConverters.formatMessages(messages, context);
    }
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
