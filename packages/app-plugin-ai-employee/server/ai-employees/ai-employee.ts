import type { Context } from '../context.js';
import type { ToolsEntity } from '@nocobase/ai-employee';
import type { AIEmployeeEntity } from '@nocobase/ai-employee';
import type { AIEmployee as AIEmployeeType } from '@nocobase/ai-employee';
/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { DatabaseConnection } from '@nocobase/app-database';
import { LLMProvider } from '@nocobase/ai-employee';
import { buildTool } from '@nocobase/ai-employee';
import { sendSSEError } from '../utils/runtime.js';
import { getSystemPrompt } from './prompts.js';
import _ from 'lodash';
import {
  AIChatContext,
  AIChatConversation,
  AIMessage,
  AIMessageInput,
  AIToolCall,
  UserDecision,
} from '@nocobase/ai-employee';
import { createAIChatConversation } from './ai-chat-conversation.js';
import {
  KnowledgeBaseGroup,
  DocumentSegmentedWithScore,
} from '@nocobase/ai-employee';
import { EEFeatures } from '@nocobase/ai-employee';
import { ChatPromptTemplate } from '@langchain/core/prompts';

import {
  conversationMiddleware,
  skillToolBindingMiddleware,
  toolCallSanitizerMiddleware,
  toolCallStatusMiddleware,
  toolInteractionMiddleware,
} from './middleware/index.js';
import { listSystemTools, SYSTEM_TOOLS } from '@nocobase/ai-employee';
import type { SkillsEntity } from '@nocobase/ai-employee';
import type { ToolsFilter, ToolsManager } from '@nocobase/ai-employee';
import { AIToolMessage } from '@nocobase/ai-employee';
import { NativeCollectionSaver } from './checkpoints/index.js';
import { createAgent as createLangChainAgent } from 'langchain';
import { Command } from '@langchain/langgraph';
import { concat } from '@langchain/core/utils/stream';
import { convertAIMessage } from './utils.js';
import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import { LLMResult } from '@langchain/core/outputs';
import type { AIToolMessageEntity } from '../repository/index.js';
import {
  listAccessibleAIEmployees,
  serializeEmployeeSummary,
} from './sub-agents/shared.js';
import { LLMStreamCached } from './llm-stream-manager.js';
import { sanitizeAdditionalKwargsForToolCalls } from './tool-call-sanitizer.js';
import {
  findMessageAttachments,
  getAttachmentSource,
  getMessageAttachmentLookupKey,
  shouldSkipAttachmentSourceLookup,
} from './attachments.js';
import {
  EXECUTE_FRONTEND_TOOL_NAME,
  LOAD_FRONTEND_TOOL_NAME,
} from './common/frontend-tools.js';
import {
  listCurrentFrontendTools,
  prepareToolsForFrontendConversation,
  shouldAutoExecuteFrontendTool,
} from './frontend-tools.js';
import {
  isReasoningFinishChunk,
  ReasoningStreamState,
  StreamConversation,
} from './reasoning-stream-state.js';

export interface ModelRef {
  llmService: string;
  model: string;
}

export interface AIEmployeeOptions {
  ctx: Context;
  employee: any;
  sessionId: string;
  systemMessage?: any;
  skillSettings?: any;
  webSearch?: boolean;
  model?: ModelRef;
  legacy?: boolean;
  from?: 'main-agent' | 'sub-agent';
  tools?: any;
}

type InterruptPayload = {
  actionRequests: { name: string; args: unknown; description: string }[];
  reviewConfigs: { actionName: string; allowedDecisions: string[] }[];
};

type InterruptAction = {
  order: number;
  description: string;
  allowedDecisions: string[];
  toolCall?: { id: string; name: string };
  currentConversation?: {
    sessionId: string;
    from: string;
    username: string;
  };
};

export class AIEmployee {
  sessionId: string;
  from = 'main-agent';
  employee: any;
  aiChatConversation: AIChatConversation;
  skillSettings?: any;
  userMessageCount = 0;

  private ctx: Context;
  private systemMessage?: any;
  private protocol: ChatStreamProtocol;
  private webSearch?: boolean;
  private model?: ModelRef;
  private legacy?: boolean;
  private tools: any;
  private inWorkflow?: boolean;
  private streamCached: LLMStreamCached;

  constructor({
    ctx,
    employee,
    sessionId,
    systemMessage,
    skillSettings,
    webSearch,
    model,
    legacy,
    from = 'main-agent',
    tools = [],
  }: AIEmployeeOptions) {
    this.employee = employee;
    this.ctx = ctx;
    this.sessionId = sessionId;
    this.systemMessage = systemMessage;
    this.aiChatConversation = createAIChatConversation(
      this.ctx,
      this.sessionId,
    );
    this.skillSettings = skillSettings;
    this.model = model;
    this.legacy = legacy;
    this.from = from;
    this.tools = tools;
    this.streamCached = this.ctx.llmStreamCachedManager.getCached(sessionId);

    const builtInManager = this.ctx.builtInManager;
    builtInManager.setupBuiltInInfo(
      ctx,
      this.employee as unknown as unknown as AIEmployeeType,
    );
    this.webSearch = webSearch;
    this.protocol = ChatStreamProtocol.fromContext(ctx, async (chunk) => {
      try {
        await this.streamCached.append(chunk);
      } catch (error) {
        this.logger.warn('Failed to append LLM stream cache', {
          sessionId: this.sessionId,
          error,
        });
      }
    });
  }

  private get chatSettings() {
    return (this.employee.chatSettings ?? {}) as {
      systemPromptMode?: 'default' | 'raw' | 'none';
      enableSkills?: boolean;
      enableTools?: boolean;
    };
  }

  private get systemPromptMode() {
    return this.chatSettings.systemPromptMode ?? 'default';
  }

  private areSkillsEnabled() {
    return this.chatSettings.enableSkills !== false;
  }

  private areToolsEnabled() {
    return this.chatSettings.enableTools !== false;
  }

  async getFormatMessages(userMessages: AIMessageInput[]) {
    const { provider } = await this.ctx.ai.llmProviderManager.getLLMService({
      ...this.model,
    });
    const { messages } = await this.aiChatConversation.getChatContext({
      userMessages,
      formatMessages: (messages) => this.formatMessages({ messages, provider }),
    });
    return messages;
  }

  async isInWorkflow() {
    if (this.inWorkflow !== undefined) {
      return this.inWorkflow;
    }
    const conversation = await this.aiConversationsRepo.findOne({
      filter: { sessionId: this.sessionId },
    });
    this.inWorkflow = conversation?.category === 'task';
    return this.inWorkflow;
  }

  // === Chat flow ===
  private buildState(messages: AIMessage[]) {
    const toolCallMessage = messages.findLast(
      (message) => message.toolCalls?.length,
    );
    return {
      messageId: toolCallMessage?.messageId,
      lastMessageIndex: {
        lastHumanMessageIndex: messages.filter((m) => m.role === 'user').length,
        lastAIMessageIndex: messages.filter(
          (m) => m.role === this.employee.username,
        ).length,
        lastToolMessageIndex: messages.filter((m) => m.role === 'tool').length,
        lastMessageIndex: messages.length,
      },
    };
  }

  private async initSession({
    messageId,
    provider,
    model,
    providerName,
    llmService,
  }) {
    const { tools, baseToolNames } = await this.getAgentTools();
    const resolvedTools = provider.resolveTools(tools.map(buildTool));
    if (!messageId && this.legacy !== true) {
      return {
        historyMessages: [],
        tools,
        resolvedTools,
        middleware: await this.getMiddleware({
          tools,
          baseToolNames,
          model,
          providerName,
          provider,
          llmService,
        }),
        config: undefined,
        state: undefined,
      };
    }

    const agentThread = await this.forkCurrentThread(provider);

    const historyMessages = await this.aiChatConversation.listMessages({
      messageId,
    });

    return {
      historyMessages,
      tools,
      resolvedTools,
      middleware: await this.getMiddleware({
        tools,
        baseToolNames,
        model,
        providerName,
        provider,
        llmService,
        messageId,
        agentThread,
      }),
      config: {
        configurable: {
          thread_id: agentThread.threadId,
        },
      },
      state: this.buildState(historyMessages),
    };
  }

  private async buildChatContext({
    messageId,
    userMessages,
    userDecisions,
  }: {
    messageId?: string;
    userMessages?: AIMessageInput[];
    userDecisions?: {
      interruptId?: string;
      decisions: UserDecision[];
    };
  }) {
    const { provider, model, service } =
      await this.ctx.ai.llmProviderManager.getLLMService({
        ...this.model,
      });
    this.userMessageCount = (userMessages ?? []).filter(
      (message) => message.role === 'user',
    ).length;
    const { historyMessages, tools, resolvedTools, middleware, config, state } =
      await this.initSession({
        messageId,
        provider,
        model,
        providerName: service.provider,
        llmService: service.name,
      });

    const chatContext = await this.aiChatConversation.getChatContext({
      userMessages: [...historyMessages, ...(userMessages ?? [])],
      userDecisions,
      tools: resolvedTools,
      middleware,
      getSystemPrompt: (userMessages) => this.getSystemPrompt(userMessages),
      formatMessages: (messages) => this.formatMessages({ messages, provider }),
    });

    return {
      providerName: service.provider,
      llmService: service.name,
      model,
      provider,
      chatContext,
      config,
      state,
    };
  }

  async stream({
    messageId,
    userMessages = [],
    userDecisions,
  }: {
    messageId?: string;
    userMessages?: AIMessageInput[];
    userDecisions?: {
      interruptId?: string;
      decisions: UserDecision[];
    };
  }) {
    await this.streamCached.clear();
    await this.aiConversationsRepo.update({
      values: { llmActiveState: 'streaming' },
      filter: {
        sessionId: this.sessionId,
      },
    });
    try {
      const {
        providerName,
        llmService,
        model,
        provider,
        chatContext,
        config,
        state,
      } = await this.buildChatContext({
        messageId,
        userMessages,
        userDecisions,
      });

      const responseMetadata = new Map<string, any>();
      const responseMetadataCollector = new ResponseMetadataCollector(
        provider,
        responseMetadata,
      );

      const { stream, signal } = await this.prepareChatStream({
        chatContext,
        provider,
        config: { ...config, callbacks: [responseMetadataCollector] } as any,
        state,
      });
      await this.processChatStream(stream, {
        signal,
        providerName,
        llmService,
        model,
        provider,
        responseMetadata,
      });

      return true;
    } catch (err) {
      this.ctx.logger.error(err);
      this.sendErrorResponse(err.message || 'Chat error warning');
      return false;
    } finally {
      await this.aiConversationsRepo.update({
        values: { llmActiveState: 'idle', read: false },
        filter: {
          sessionId: this.sessionId,
        },
      });
      await this.streamCached.clear();
    }
  }

  async invoke({
    messageId,
    userMessages = [],
    userDecisions,
    writer,
    context,
    signal,
  }: {
    messageId?: string;
    userMessages?: AIMessageInput[];
    userDecisions?: {
      interruptId?: string;
      decisions: UserDecision[];
    };
    writer?: (chunk: any) => void;
    context?: any;
    signal?: AbortSignal;
  }) {
    await this.aiConversationsRepo.update({
      values: { llmActiveState: 'invoking' },
      filter: {
        sessionId: this.sessionId,
      },
    });
    try {
      const { provider, chatContext, config, state } =
        await this.buildChatContext({
          messageId,
          userMessages,
          userDecisions,
        });

      const { threadId } = await this.getCurrentThread();
      const invokeConfig = {
        context: {
          ctx: this.ctx,
          decisions: chatContext.decisions,
          ...context,
        },
        recursionLimit: 200,
        configurable:
          this.from === 'main-agent' ? { thread_id: threadId } : undefined,
        writer,
        signal,
        ...config,
      };

      const invokeResult = await this.agentInvoke(
        provider,
        chatContext,
        invokeConfig,
        state,
      );

      await this.handleInterruptedToolCalls(
        invokeResult?.__interrupt__?.[0],
        () => invokeResult?.messageId,
      );

      return invokeResult;
    } catch (err) {
      if (err.name === 'GraphInterrupt') {
        throw err;
      }
      this.ctx.logger.error(err);
      throw err;
    } finally {
      await this.aiConversationsRepo.update({
        values: { llmActiveState: 'idle' },
        filter: {
          sessionId: this.sessionId,
        },
      });
    }
  }

  // === Agent wiring & execution ===
  async createAgent({
    provider,
    systemPrompt,
    tools,
    middleware,
  }: {
    provider: LLMProvider;
    systemPrompt?: string;
    tools?: any[];
    middleware?: any[];
  }) {
    const model = provider.createModel();
    const allTools = tools ?? [];
    if (this.from === 'main-agent') {
      const checkpointer = new NativeCollectionSaver({
        checkpoints: this.ctx.repositories.lcCheckpoints,
        blobs: this.ctx.repositories.lcCheckpointBlobs,
        writes: this.ctx.repositories.lcCheckpointWrites,
      });
      return createLangChainAgent({
        model,
        tools: allTools,
        middleware,
        systemPrompt,
        checkpointer,
      });
    } else {
      return createLangChainAgent({
        model,
        tools: allTools,
        middleware,
        systemPrompt,
      });
    }
  }

  private getAgentInput(context: AIChatContext, state?: any) {
    if (context.decisions?.decisions?.length) {
      return new Command({
        resume: context.decisions.interruptId
          ? {
              [context.decisions.interruptId]: {
                decisions: context.decisions.decisions,
              },
            }
          : {
              decisions: context.decisions.decisions,
            },
      });
    }
    if (context.messages) {
      return { messages: context.messages, ...state };
    }
    return null;
  }

  async agentStream(
    provider: LLMProvider,
    context: AIChatContext,
    config?: any,
    state?: any,
  ) {
    const { systemPrompt, tools, middleware } = context;
    const agent = await this.createAgent({
      provider,
      systemPrompt,
      tools,
      middleware,
    });
    const input = this.getAgentInput(context, state);
    if (this.from === 'sub-agent') {
      delete config.configurable;
    }
    return agent.stream(input, this.withRunMetadata(config));
  }

  async agentInvoke(
    provider: LLMProvider,
    context: AIChatContext,
    config?: any,
    state?: any,
  ): Promise<any> {
    const { systemPrompt, tools, middleware } = context;
    const agent = await this.createAgent({
      provider,
      systemPrompt,
      tools,
      middleware,
    });
    const input = this.getAgentInput(context, state);
    if (this.from === 'sub-agent') {
      delete config.configurable;
    }
    return agent.invoke(input, this.withRunMetadata(config));
  }

  async prepareChatStream({
    chatContext,
    provider,
    config,
    state,
  }: {
    chatContext: AIChatContext;
    provider: LLMProvider;
    config?: { configurable?: any };
    state?: any;
  }) {
    const controller = new AbortController();
    const { signal } = controller;

    try {
      const { threadId } = await this.getCurrentThread();
      const stream = await this.agentStream(
        provider,
        chatContext,
        {
          signal,
          streamMode: ['updates', 'messages', 'custom'],
          configurable:
            this.from === 'main-agent' ? { thread_id: threadId } : undefined,
          context: { ctx: this.ctx, decisions: chatContext.decisions },
          recursionLimit: 200,
          ...config,
        },
        state,
      );
      this.ctx.aiEmployeesManager.conversationController.set(
        this.sessionId,
        controller,
      );
      return { stream, controller, signal };
    } catch (error) {
      throw error;
    }
  }

  async processChatStream(
    stream: any,
    options: {
      signal: AbortSignal;
      providerName: string;
      llmService?: string;
      model: string;
      provider: LLMProvider;
      allowEmpty?: boolean;
      responseMetadata: Map<string, any>;
    },
  ) {
    const aiMessageIdMap = new Map<string, string>();
    const {
      signal,
      providerName,
      llmService,
      model,
      provider,
      responseMetadata,
      allowEmpty = false,
    } = options;

    const reasoningState = new ReasoningStreamState();
    const stopReasoning = async (conversation: StreamConversation) => {
      if (reasoningState.stop(conversation)) {
        await this.protocol.with(conversation).stopReasoning();
      }
    };
    const stopAllReasoning = async () => {
      for (const conversation of reasoningState.drain()) {
        await this.protocol.with(conversation).stopReasoning();
      }
    };
    let gathered: any;
    signal.addEventListener('abort', async () => {
      try {
        await stopAllReasoning();
        if (gathered?.type === 'ai') {
          const values = convertAIMessage({
            aiEmployee: this,
            providerName,
            provider,
            llmService,
            model,
            aiMessage: gathered,
          });
          if (values) {
            values.metadata.interrupted = true;
          }

          await this.aiChatConversation.withTransaction(
            async (conversation, transaction) => {
              const result: AIMessage = await conversation.addMessages(values);
            },
          );
        }
      } catch (e) {
        this.logger.error(
          'Fail to save message after conversation abort',
          gathered,
        );
      } finally {
        await this.aiConversationsRepo.update({
          values: { llmActiveState: 'idle', read: true },
          filter: {
            sessionId: this.sessionId,
          },
        });
        await this.streamCached.clear();
      }
    });

    try {
      const aiEmployeeConversation = {
        sessionId: this.sessionId,
        from: this.from,
        username: this.employee.username,
      };
      await this.protocol.with(aiEmployeeConversation).startStream();
      for await (const [mode, chunks] of stream) {
        if (mode === 'messages') {
          const [chunk, metadata] = chunks;
          const { currentConversation } = metadata;
          if (chunk.type === 'ai') {
            gathered = gathered !== undefined ? concat(gathered, chunk) : chunk;

            const reasoningContent = provider.parseReasoningContent(chunk);
            if (reasoningContent) {
              reasoningState.start(currentConversation);
              await this.protocol
                .with(currentConversation)
                .reasoning(reasoningContent);
            }

            const parsedContent = chunk.content
              ? provider.parseResponseChunk(chunk.content)
              : null;
            if (parsedContent) {
              await stopReasoning(currentConversation);
              await this.protocol
                .with(currentConversation)
                .content(parsedContent);
            }

            if (chunk.tool_call_chunks?.length) {
              await stopReasoning(currentConversation);
              await this.protocol
                .with(currentConversation)
                .toolCallChunks(chunk.tool_call_chunks);
            }

            const webSearch = provider.parseWebSearchAction(chunk);
            if (webSearch?.length) {
              await stopReasoning(currentConversation);
              await this.protocol
                .with(currentConversation)
                .webSearch(webSearch);
            }

            if (isReasoningFinishChunk(chunk)) {
              await stopReasoning(currentConversation);
            }
          }
        } else if (mode === 'updates') {
          const interrupt = chunks?.__interrupt__?.[0];
          if (interrupt) {
            const toolsMap = await this.getToolsMap();
            await this.handleInterruptedToolCalls(
              interrupt,
              (sessionId) => aiMessageIdMap.get(sessionId),
              async ({
                messageId,
                interruptAction,
                toolCall,
                currentConversation,
              }) => {
                await this.protocol.with(currentConversation).toolCallStatus({
                  toolCall: {
                    messageId,
                    id: toolCall.id,
                    name: toolCall.name,
                    willInterrupt: this.shouldInterruptToolCall(
                      toolsMap.get(toolCall.name),
                    ),
                  },
                  invokeStatus: 'interrupted',
                  interruptAction,
                });
              },
            );
          }
        } else if (mode === 'custom') {
          const { currentConversation } = chunks;
          if (chunks.action === 'AfterAIMessageSaved') {
            await this.streamCached.skipped();
            aiMessageIdMap.set(
              currentConversation.sessionId,
              chunks.body.messageId,
            );

            const data = responseMetadata.get(chunks.body.id);
            if (data) {
              const savedMessage = await this.aiMessagesRepo.findOne({
                filter: {
                  messageId: chunks.body.messageId,
                },
              });
              if (savedMessage) {
                await this.aiMessagesRepo.update({
                  values: {
                    metadata: {
                      ...savedMessage.metadata,
                      response_metadata: {
                        ...savedMessage.metadata.response_metadata,
                        ...data,
                      },
                    },
                  },
                  filter: {
                    messageId: chunks.body.messageId,
                  },
                });
              }
            }
          } else if (chunks.action === 'initToolCalls') {
            await stopReasoning(currentConversation);
            await this.protocol
              .with(currentConversation)
              .toolCalls(chunks.body);
          } else if (chunks.action === 'beforeToolCall') {
            const toolsMap = await this.getToolsMap();
            const willInterrupt = this.shouldInterruptToolCall(
              toolsMap.get(chunks.body?.toolCall?.name),
            );
            await this.protocol.with(currentConversation).toolCallStatus({
              toolCall: {
                messageId: chunks.body?.toolCall?.messageId,
                id: chunks.body?.toolCall?.id,
                name: chunks.body?.toolCall?.name,
                willInterrupt,
              },
              invokeStatus: 'pending',
            });
          } else if (chunks.action === 'afterToolCall') {
            const toolsMap = await this.getToolsMap();
            const willInterrupt = this.shouldInterruptToolCall(
              toolsMap.get(chunks.body?.toolCall?.name),
            );
            await this.protocol.with(currentConversation).toolCallStatus({
              toolCall: {
                messageId: chunks.body?.toolCall?.messageId,
                id: chunks.body?.toolCall?.id,
                name: chunks.body?.toolCall?.name,
                willInterrupt,
              },
              invokeStatus: 'done',
              status: chunks.body?.toolCallResult?.status,
              invokeStartTime: chunks.body?.toolCallResult?.invokeStartTime,
              invokeEndTime: chunks.body?.toolCallResult?.invokeEndTime,
              content: chunks.body?.toolCallResult?.content,
            });
          } else if (chunks.action === 'beforeSendToolMessage') {
            const { messageId, messages } = chunks.body ?? {};
            if (messages.length) {
              const toolsMap = await this.getToolsMap();
              const toolCallResultMap = await this.getToolCallResultMap(
                messageId,
                messages.map((x) => x.metadata).map((x) => x.toolCallId),
              );
              for (const { metadata } of messages) {
                const tools = toolsMap.get(metadata.toolName);
                const toolCallResult = toolCallResultMap.get(
                  metadata.toolCallId,
                );
                await this.protocol.with(currentConversation).toolCallStatus({
                  toolCall: {
                    messageId,
                    id: metadata.toolCallId,
                    name: metadata.toolName,
                    willInterrupt: this.shouldInterruptToolCall(tools),
                  },
                  invokeStatus: 'confirmed',
                  status: toolCallResult?.status,
                  invokeStartTime: toolCallResult?.invokeStartTime,
                  invokeEndTime: toolCallResult?.invokeEndTime,
                  content: toolCallResult?.content,
                });
              }
            }

            await this.protocol.with(currentConversation).newMessage();
          } else if (chunks.action === 'afterSubAgentInvoke') {
            await this.protocol.with(currentConversation).subAgentCompleted();
          }
        }
      }

      await stopAllReasoning();
      if (
        this.protocol.statistics.sent === 0 &&
        !signal.aborted &&
        !allowEmpty
      ) {
        this.sendErrorResponse('Empty message');
        return;
      }

      await this.protocol.with(aiEmployeeConversation).endStream();
    } catch (err) {
      await stopAllReasoning();
      this.ctx.logger.error(err);
      if (err.name === 'GraphRecursionError') {
        this.sendSpecificError({ name: err.name, message: err.message });
      } else {
        this.sendErrorResponse(provider.parseResponseError(err));
      }
    } finally {
      if (this.from === 'main-agent') {
        this.ctx.res.end();
      }
    }
  }

  private async handleInterruptedToolCalls(
    interrupt: { id?: string; value?: InterruptPayload } | undefined,
    getMessageId: (sessionId: string) => string | undefined,
    onInterrupted?: (params: {
      messageId: string;
      interruptId: string;
      interruptAction: InterruptAction;
      toolCall: { id: string; name: string };
      currentConversation: {
        sessionId: string;
        from: string;
        username: string;
      };
    }) => Promise<void> | void,
  ) {
    const interruptId = interrupt?.id;
    const interruptActions = this.toInterruptActions(interrupt?.value);
    if (!interruptId || !interruptActions.size) {
      return;
    }

    for (const interruptAction of interruptActions.values()) {
      const currentConversation = interruptAction.currentConversation;
      const toolCall = interruptAction.toolCall;
      if (!currentConversation || !toolCall) {
        this.logger.warn(
          'currentConversation or toolCall not exist in __interrupt__',
          interruptAction,
        );
        continue;
      }

      const messageId = getMessageId(currentConversation.sessionId);
      if (!messageId) {
        continue;
      }

      await this.updateToolCallInterrupted(
        currentConversation.sessionId,
        messageId,
        toolCall.id,
        interruptId,
        interruptAction,
      );
      await onInterrupted?.({
        messageId,
        interruptId,
        interruptAction,
        toolCall,
        currentConversation,
      });
    }
  }

  // === Prompts & knowledge base ===
  async getSystemPrompt(userMessages: AIMessageInput[]) {
    if (this.systemPromptMode === 'none') {
      return '';
    }

    const about = this.employee.about ?? this.employee.defaultPrompt ?? '';
    if (this.systemPromptMode === 'raw') {
      return about;
    }

    const userConfig = await this.ctx.repositories.usersAiEmployees.findOne({
      filter: {
        userId: this.ctx.auth?.user.id ?? 0,
        aiEmployee: this.employee.username,
      },
    });

    let background = '';
    if (this.systemMessage) {
      background = this.systemMessage;
    }

    const aiMessages = await this.aiChatConversation.listMessages();
    const workContextBackground = await this.ctx.workContextHandler.background(
      this.ctx,
      aiMessages,
    );
    if (workContextBackground?.length) {
      background = `${background}\n${workContextBackground.join('\n')}`;
    }
    const addSystemPrompt = userMessages?.filter((it) => it.role == 'system');
    if (addSystemPrompt.length) {
      background = `${background}\n${addSystemPrompt.map((it) => it.content).join('\n')}`;
    }

    let knowledgeBase: string | undefined;
    const { knowledgeBaseManager } = this.ctx;
    const employee: AIEmployeeType = this.employee as unknown as AIEmployeeType;
    if (
      (await knowledgeBaseManager.isEnabledKnowledgeBase(employee)) &&
      employee.knowledgeBasePrompt &&
      userMessages?.length
    ) {
      const lastUserMessage = userMessages
        .filter((x) => x.role === 'user')
        .at(-1);
      if (lastUserMessage) {
        knowledgeBase = await knowledgeBaseManager.retrievePrompt({
          employee,
          query: lastUserMessage.content.content as string,
        });
      }
    }

    const availableSkills = await this.getAvailableSkills();
    const availableAIEmployees = await this.getAvailableAIEmployees();

    const systemPrompt = getSystemPrompt({
      aiEmployee: {
        nickname: this.employee.nickname,
        about,
      },
      task: {
        background,
      },
      personal: userConfig?.prompt,
      environment: {
        database: this.ctx.database.dialect,
        locale: this.ctx.getCurrentLocale?.() || 'en-US',
        currentDateTime: getCurrentDateTimeForPrompt(
          this.ctx.getCurrentLocale?.(),
          getCurrentTimezone(this.ctx),
        ),
        timezone: getCurrentTimezone(this.ctx),
      },
      knowledgeBase,
      availableSkills,
      availableAIEmployees,
      webSearch: this.webSearch,
    });

    const { important } = this.ctx.action?.params?.values || {};
    if (important === 'GraphRecursionError') {
      const importantPrompt = `<Important>You have already called tools multiple times and gathered sufficient information.
First, provide a summary based on the existing information. Do not call additional tools.
If information is missing, clearly state it in the summary.</Important>`;
      return importantPrompt + '\n\n' + systemPrompt;
    } else {
      return systemPrompt;
    }
  }

  // === Tool calls ===
  async initToolCall(
    transaction: DatabaseConnection,
    messageId: string,
    toolCalls: {
      id: string;
      name: string;
      args: unknown;
    }[],
  ): Promise<AIToolMessageEntity[]> {
    const nowTime = new Date();
    const toolMap = await this.getToolsMap();
    const currentFrontendTools = toolCalls.some(
      (toolCall) => toolCall.name === EXECUTE_FRONTEND_TOOL_NAME,
    )
      ? await listCurrentFrontendTools(this.ctx, this.sessionId)
      : [];
    return (await this.aiToolMessagesRepo.create(
      {
        values: toolCalls.map((toolCall) => {
          const toolsExisted = toolMap.has(toolCall.name);
          const tools = toolMap.get(toolCall.name);
          const auto =
            toolCall.name === EXECUTE_FRONTEND_TOOL_NAME
              ? toolsExisted &&
                shouldAutoExecuteFrontendTool(
                  currentFrontendTools,
                  toolCall.args,
                )
              : this.isAutoCall(tools);
          return {
            id: this.ctx.snowflake.generate(),
            sessionId: this.sessionId,
            messageId: messageId,
            toolCallId: toolCall.id,
            toolName: toolCall.name,
            status: toolsExisted ? null : 'error',
            content: toolsExisted ? null : `Tool ${toolCall.name} not found`,
            invokeStatus: toolsExisted ? 'init' : 'done',
            invokeStartTime: toolsExisted ? null : nowTime,
            invokeEndTime: toolsExisted ? null : nowTime,
            auto,
            execution: tools?.execution ?? 'backend',
          };
        }),
      },
      { connection: transaction },
    )) as AIToolMessage[];
  }

  async updateToolCallInterrupted(
    sessionId: string,
    messageId: string,
    toolCallId: string,
    interruptId: string,
    interruptAction: {
      order: number;
      description?: string;
      allowed_decisions?: string[];
    },
  ) {
    return await this.ctx.database.transaction(async (connection) => {
      const updated = await this.aiToolMessagesRepo.update(
        {
          values: {
            invokeStatus: 'interrupted',
            interruptActionOrder: interruptAction.order,
            interruptAction,
          },
          filter: {
            sessionId,
            messageId,
            toolCallId,
            invokeStatus: 'init',
          },
        },
        { connection },
      );

      if (!updated) {
        return updated;
      }

      const message = await this.aiMessagesRepo.findOne(
        {
          filter: {
            messageId,
            sessionId,
          },
        },
        { connection },
      );

      if (!message) {
        return updated;
      }

      await this.aiMessagesRepo.update(
        {
          values: {
            metadata: {
              ...(message.metadata ?? {}),
              interruptId,
            },
          },
          filter: {
            messageId,
            sessionId,
          },
        },
        { connection },
      );

      return updated;
    });
  }

  async updateToolCallPending(messageId: string, toolCallId: string) {
    const updated = await this.aiToolMessagesRepo.update({
      values: {
        invokeStatus: 'pending',
        invokeStartTime: new Date(),
      },
      filter: {
        sessionId: this.sessionId,
        messageId,
        toolCallId,
        invokeStatus: {
          $in: ['init', 'waiting'],
        },
      },
    });
    return updated;
  }

  async updateToolCallDone(messageId: string, toolCallId: string, result: any) {
    const updated = await this.aiToolMessagesRepo.update({
      values: {
        invokeStatus: 'done',
        invokeEndTime: new Date(),
        status: result?.status ?? 'success',
        content: result?.content ?? result,
      },
      filter: {
        sessionId: this.sessionId,
        messageId,
        toolCallId,
        invokeStatus: 'pending',
      },
    });
    return updated;
  }

  async confirmToolCall(
    transaction: DatabaseConnection,
    messageId: string,
    toolCallIds: string[],
  ) {
    const updated = await this.aiToolMessagesRepo.update(
      {
        values: {
          invokeStatus: 'confirmed',
        },
        filter: {
          sessionId: this.sessionId,
          messageId,
          toolCallId: {
            $in: toolCallIds,
          },
        },
      },
      { connection: transaction },
    );
    return updated;
  }

  async getToolCallResult(
    messageId: string,
    toolCallId: string,
  ): Promise<AIToolMessage | null> {
    return await this.aiToolMessagesRepo.findOne({
      filter: {
        messageId,
        toolCallId,
      },
    });
  }

  async getToolCallResultMap(
    messageId: string,
    toolCallIds: string[],
  ): Promise<Map<string, AIToolMessage>> {
    const list = await this.aiToolMessagesRepo.find({
      filter: {
        messageId,
        toolCallId: {
          $in: toolCallIds,
        },
      },
    });
    return new Map(
      list.map((item) => [item.toolCallId, item as AIToolMessage]),
    );
  }

  async cancelToolCall() {
    let messageId;
    const historyMessages = await this.ctx.repositories.aiMessages.find({
      filter: { sessionId: this.sessionId },
      sort: ['-messageId'],
    });
    const [lastMessage] = historyMessages;
    if (lastMessage?.toolCalls?.length ?? 0 > 0) {
      messageId = lastMessage.messageId;
    } else {
      return;
    }
    const toolMessages = await this.aiToolMessagesRepo.find({
      filter: {
        messageId,
        invokeStatus: {
          $ne: 'confirmed',
        },
      },
    });
    if (!toolMessages || _.isEmpty(toolMessages)) {
      return;
    }

    const { model, service } =
      await this.ctx.ai.llmProviderManager.getLLMService({
        ...this.model,
      });
    const toolCallMap = await this.getToolCallMap(messageId);
    const now = new Date();
    const toolMessageContent =
      'The user ignored the application for tools usage and will continued to ask questions';
    return await this.ctx.database.transaction(async (connection) => {
      for (const toolMessage of toolMessages) {
        await this.aiToolMessagesRepo.update(
          {
            values: {
              invokeStatus: 'confirmed',
              status: 'success',
              content: toolMessageContent,
              invokeStartTime: toolMessage.invokeStartTime ?? now,
              invokeEndTime: toolMessage.invokeEndTime ?? now,
            },
            filter: {
              id: toolMessage.id,
              invokeStatus: toolMessage.invokeStatus,
            },
          },
          { connection },
        );
      }
      return await this.ctx.repositories.aiMessages.create(
        {
          values: toolMessages.map((toolMessage) => ({
            messageId: String(this.ctx.snowflake.generate()),
            sessionId: this.sessionId,
            role: 'tool',
            content: {
              type: 'text',
              content: toolMessageContent,
            },
            metadata: {
              model,
              provider: service.provider,
              toolCall: toolCallMap.get(toolMessage.toolCallId),
              toolCallId: toolMessage.toolCallId,
              sourceMessageId: messageId,
              autoCall: toolMessage.auto,
            },
          })),
        },
        { connection },
      );
    });
  }

  get logger() {
    return this.ctx.logger;
  }

  sendErrorResponse(errorMessage: string) {
    sendSSEError(this.ctx, errorMessage);
  }

  sendSpecificError({ name, message }: { name: string; message: string }) {
    sendSSEError(this.ctx, message, name);
  }

  // === Conversation/thread helpers ===
  async updateThread(
    transaction: DatabaseConnection,
    { sessionId, thread }: { sessionId: string; thread: number },
  ) {
    await this.aiConversationsRepo.update(
      {
        values: { thread },
        filter: {
          sessionId,
          thread: {
            $lt: thread,
          },
        },
      },
      { connection: transaction },
    );
  }

  removeAbortController() {
    this.ctx.aiEmployeesManager.conversationController.delete(this.sessionId);
  }

  shouldInterruptToolCall(tools: ToolsEntity): boolean {
    return tools?.execution === 'frontend' || !this.isAutoCall(tools);
  }

  isAutoCall(tools: ToolsEntity): boolean {
    if (!tools) {
      return false;
    }
    const isAutoCall = tools.defaultPermission === 'ALLOW';
    if (tools.scope !== 'CUSTOM') {
      return isAutoCall;
    }
    const employeeTools = this.employee.skillSettings?.tools ?? [];
    const presetTools = employeeTools.find(
      (s) => s.name === tools.definition.name,
    );
    return presetTools ? presetTools.autoCall : isAutoCall;
  }

  private async normalizeMessageAttachments(
    messages: AIMessageInput[],
  ): Promise<AIMessageInput[]> {
    const attachments = messages
      .filter((message) => Array.isArray(message.attachments))
      .flatMap((message) => message.attachments);

    if (!attachments.length) {
      return messages;
    }

    const attachmentsByLookup = await findMessageAttachments(
      this.ctx,
      attachments,
    );
    return messages.map((message) => {
      if (!Array.isArray(message.attachments) || !message.attachments.length) {
        return message;
      }
      return {
        ...message,
        attachments: message.attachments.flatMap((attachment) => {
          const source = getAttachmentSource(attachment);
          if (!source || shouldSkipAttachmentSourceLookup(source)) {
            return [attachment];
          }
          const lookupKey = getMessageAttachmentLookupKey(attachment);
          const verifiedAttachment = lookupKey
            ? attachmentsByLookup.get(lookupKey)
            : null;
          if (!verifiedAttachment) {
            return [];
          }
          return [{ ...verifiedAttachment, source }];
        }),
      };
    });
  }

  private async formatMessages({
    messages,
    provider,
  }: {
    messages: AIMessageInput[];
    provider: LLMProvider;
  }) {
    const formattedMessages = [];
    const workContextHandler = this.ctx.workContextHandler;
    const normalizedMessages = await this.normalizeMessageAttachments(messages);

    // 截断过长的内容
    const truncate = (text: string, maxLen = 50000) => {
      if (!text || text.length <= maxLen) return text;
      return text.slice(0, maxLen) + '\n...[truncated]';
    };

    for (const msg of normalizedMessages) {
      const attachments = msg.attachments;
      const workContext = msg.workContext;
      const userContent = msg.content;
      let { content } = userContent ?? {};

      // Handle array content from providers like Anthropic web search (backward compat)
      if (Array.isArray(content)) {
        const textBlocks = content.filter(
          (block: any) => block.type === 'text',
        );
        content = textBlocks.map((block: any) => block.text).join('') || '';
      }

      // 截断消息内容
      if (typeof content === 'string') {
        content = truncate(content);
      }
      if (msg.role === 'user') {
        if (typeof content === 'string') {
          content = `<user_query>${content}</user_query>`;
          if (workContext?.length) {
            const workContextStr = (
              await workContextHandler.resolve(this.ctx, workContext)
            )
              .map((x) => `<work_context>${x}</work_context>`)
              .join('\n');
            content = workContextStr + '\n' + content;
          }
        }
        const contentBlocks = [];
        if (attachments?.length) {
          for (const attachment of attachments) {
            const parsed = await provider.parseAttachment(attachment as any, {
              fileManager: this.ctx.fileManager,
              documentLoader: this.ctx.documentLoaders.cached,
              caching: this.ctx.caching,
              getHeader: (name: string) => this.ctx.get(name),
            });
            if (parsed.placement === 'system') {
              formattedMessages.push({
                role: 'system',
                content: parsed.content,
              });
            } else {
              contentBlocks.push(parsed.content);
            }
          }
          if (content && contentBlocks.length > 0) {
            contentBlocks.push({
              type: 'text',
              text: content,
            });
          }
        }
        const role = 'user';
        const additional_kwargs = { userContent, attachments, workContext };
        if (contentBlocks.length) {
          formattedMessages.push({
            role,
            additional_kwargs,
            contentBlocks,
          });
        } else {
          formattedMessages.push({
            role,
            additional_kwargs,
            content,
          });
        }

        continue;
      }
      if (msg.role === 'tool') {
        formattedMessages.push({
          role: 'tool',
          content,
          tool_call_id: msg.metadata?.toolCallId,
        });
        continue;
      }
      const additionalKwargs = sanitizeAdditionalKwargsForToolCalls(
        msg.metadata?.additional_kwargs,
        msg.toolCalls,
        {
          onDiscard: (info) => {
            this.logger.warn(
              'Discard malformed raw tool calls from AI message',
              {
                phase: 'formatMessages',
                messageId: msg.metadata?.id,
                ...info,
              },
            );
          },
        },
      ).additionalKwargs;
      formattedMessages.push({
        role: 'assistant',
        content,
        tool_calls: msg.toolCalls,
        response_metadata: msg.metadata?.response_metadata,
        additional_kwargs:
          provider.prepareStoredAssistantAdditionalKwargs(additionalKwargs),
      });
    }

    return formattedMessages;
  }

  private async getToolCallMap(messageId: string): Promise<
    Map<
      string,
      {
        id: string;
        args: unknown;
        name: string;
        type: string;
      }
    >
  > {
    const result = new Map();
    const { toolCalls } = await this.aiMessagesRepo.findById(messageId);
    if (!toolCalls) {
      return result;
    }
    for (const toolCall of toolCalls) {
      result.set(toolCall.id, toolCall);
    }
    return result;
  }

  private toInterruptActions(
    interrupt?: InterruptPayload,
  ): Map<string, InterruptAction> {
    const result = new Map<string, InterruptAction>();
    const { actionRequests = [], reviewConfigs = [] } = interrupt ?? {};
    if (!actionRequests.length) {
      return result;
    }
    let order = 0;
    const actionRequestsMap = new Map(actionRequests.map((x) => [x.name, x]));
    const reviewConfigsMap = new Map(
      reviewConfigs.map((x) => [x.actionName, x]),
    );

    for (const [name, actionRequest] of actionRequestsMap.entries()) {
      const payload = actionRequest.description
        ? JSON.parse(actionRequest.description)
        : null;
      result.set(name, {
        order: order++,
        description: actionRequest.description,
        allowedDecisions: reviewConfigsMap.get(name)?.allowedDecisions,
        toolCall: {
          id: payload.toolCallId,
          name: payload.toolCallName,
        },
        currentConversation: {
          sessionId: payload.sessionId,
          from: payload.from,
          username: payload.username,
        },
      });
    }
    return result;
  }

  private async getAIEmployeeTools() {
    if (!this.areToolsEnabled()) {
      return [];
    }
    const currentFrontendTools = await listCurrentFrontendTools(
      this.ctx,
      this.sessionId,
    );
    const tools: ToolsEntity[] = await this.listTools({ scope: 'GENERAL' });
    const getSkill = await this.toolsManager.getTools(SYSTEM_TOOLS.GET_SKILL, {
      ctx: this.ctx,
    });
    if (getSkill) {
      tools.push(getSkill);
    }
    if (this.webSearch === true) {
      const subAgentWebSearch = await this.toolsManager.getTools(
        SYSTEM_TOOLS.WEB_SEARCH,
        { ctx: this.ctx },
      );
      tools.push(subAgentWebSearch);
    }
    const generalToolsNameSet = new Set(tools.map((x) => x.definition.name));
    const toolMap = await this.getToolsMap();
    const settingsTools = this.employee.skillSettings?.tools ?? [];
    const employeeTools = [...settingsTools, ...this.tools];
    if (
      await this.ctx.knowledgeBaseManager.isEnabledKnowledgeBase(
        this.employee as unknown as AIEmployeeType,
      )
    ) {
      const knowledgeBaseRetrieveTool = await this.toolsManager.getTools(
        SYSTEM_TOOLS.KNOWLEDGE_BASE,
        {
          ctx: this.ctx,
        },
      );
      if (knowledgeBaseRetrieveTool) {
        employeeTools.push({ name: SYSTEM_TOOLS.KNOWLEDGE_BASE });
      }
    }
    for (const toolSetting of employeeTools) {
      if (generalToolsNameSet.has(toolSetting.name)) {
        continue;
      }
      const tool = toolMap.get(toolSetting.name);
      if (!tool) {
        continue;
      }
      tools.push(tool);
    }
    const systemTools = [
      ...listSystemTools(),
      LOAD_FRONTEND_TOOL_NAME,
      EXECUTE_FRONTEND_TOOL_NAME,
    ];
    if (!this.skillSettings) {
      return prepareToolsForFrontendConversation(tools, currentFrontendTools);
    } else if (!this.skillSettings.toolsVersion) {
      const toolFilter = this.skillSettings.tools ?? [];
      return prepareToolsForFrontendConversation(
        tools.filter(
          (t) =>
            toolFilter.length === 0 ||
            systemTools.includes(t.definition.name) ||
            toolFilter.includes(t.definition.name),
        ),
        currentFrontendTools,
      );
    } else {
      const toolFilter = this.skillSettings.tools;
      if (_.isArray(toolFilter)) {
        return prepareToolsForFrontendConversation(
          tools.filter(
            (t) =>
              systemTools.includes(t.definition.name) ||
              toolFilter.includes(t.definition.name),
          ),
          currentFrontendTools,
        );
      } else {
        return prepareToolsForFrontendConversation(tools, currentFrontendTools);
      }
    }
  }

  private async getAvailableSkills(): Promise<SkillsEntity[]> {
    if (!this.areSkillsEnabled()) {
      return [];
    }
    const { skillsManager } = this.ctx.ai;
    const aIEmployeeTools = await this.getAIEmployeeTools();
    const getSkill = aIEmployeeTools.find(
      (it) => it.definition.name === 'getSkill',
    );
    if (!getSkill) {
      return [];
    }
    const generalSkills = await skillsManager.listSkills({ scope: 'GENERAL' });
    const specifiedSkillNames = this.employee.skillSettings?.skills ?? [];
    const specifiedSkills = specifiedSkillNames.length
      ? await skillsManager.getSkills(specifiedSkillNames)
      : [];
    const mergedSkills = _.uniqBy(
      [...(specifiedSkills || []), ...(generalSkills || [])],
      'name',
    );

    if (!this.skillSettings) {
      return mergedSkills;
    } else if (!this.skillSettings.skillsVersion) {
      const skillFilter = this.skillSettings.skills ?? [];
      return mergedSkills.filter(
        (it) => skillFilter.length === 0 || skillFilter.includes(it.name),
      );
    } else {
      const skillFilter = this.skillSettings.skills;
      if (_.isArray(skillFilter)) {
        return mergedSkills.filter((it) => skillFilter.includes(it.name));
      } else {
        return mergedSkills;
      }
    }
  }

  private async getAgentTools(): Promise<{
    tools: ToolsEntity[];
    baseToolNames: Set<string>;
  }> {
    if (!this.areToolsEnabled()) {
      return {
        tools: [],
        baseToolNames: new Set(),
      };
    }
    const baseTools = await this.getAIEmployeeTools();
    const toolMap = await this.getToolsMap();
    for (const tool of baseTools) {
      toolMap.set(tool.definition.name, tool);
    }
    const availableSkills = await this.getAvailableSkills();
    const skillOwnedToolNames = new Set(
      availableSkills.flatMap((it) => it.tools ?? []),
    );
    const baseToolNames = new Set(
      baseTools
        .map((it) => it.definition.name)
        .filter(
          (name) => name === 'getSkill' || !skillOwnedToolNames.has(name),
        ),
    );

    return {
      tools: Array.from(toolMap.values()),
      baseToolNames,
    };
  }

  async getLoadedSkillNames(): Promise<string[]> {
    const list = await this.aiToolMessagesRepo.find({
      filter: {
        sessionId: this.sessionId,
        toolName: 'getSkill',
        status: 'success',
      },
      sort: ['id'],
    });
    const result = new Set<string>();
    for (const item of list) {
      const { content } = item;
      if (
        _.isPlainObject(content) &&
        typeof content['skillName'] === 'string'
      ) {
        result.add(content['skillName']);
        continue;
      }
      if (typeof content === 'string') {
        try {
          const parsed = JSON.parse(content);
          if (
            _.isPlainObject(parsed) &&
            typeof parsed['skillName'] === 'string'
          ) {
            result.add(parsed['skillName']);
          }
        } catch (e) {
          // ignore unexpected plain-string content
        }
      }
    }
    return Array.from(result.values());
  }

  async getActivatedSkillToolNames(): Promise<Set<string>> {
    const loadedSkillNames = await this.getLoadedSkillNames();
    if (!loadedSkillNames.length) {
      return new Set<string>();
    }
    const availableSkills = await this.getAvailableSkills();
    const loadedSkills =
      await this.ctx.ai.skillsManager.getSkills(loadedSkillNames);
    const normalizedLoadedSkills = Array.isArray(loadedSkills)
      ? loadedSkills
      : [loadedSkills];
    const skillsMap = new Map(
      [...availableSkills, ...normalizedLoadedSkills.filter(Boolean)].map(
        (it) => [it.name, it],
      ),
    );
    const result = new Set<string>();
    for (const skillName of loadedSkillNames) {
      const target = skillsMap.get(skillName);
      for (const toolName of target?.tools ?? []) {
        result.add(toolName);
      }
    }
    return result;
  }

  private async getAvailableAIEmployees() {
    const specifiedToolNames: string[] =
      this.employee.skillSettings?.tools?.map(
        ({ name }: { name: string }) => name,
      ) ?? [];
    if (!specifiedToolNames.includes('dispatch-sub-agent-task')) {
      return [];
    }
    const availableAIEmployees = (await listAccessibleAIEmployees(this.ctx))
      .map((employee) => serializeEmployeeSummary(this.ctx, employee))
      .filter((it) => it.username !== this.employee.username);
    return availableAIEmployees;
  }

  private async getMiddleware(options: {
    providerName: string;
    provider: LLMProvider;
    llmService?: string;
    model: string;
    tools: any[];
    baseToolNames: Set<string>;
    messageId?: string;
    agentThread?: AgentThread;
  }) {
    const {
      providerName,
      provider,
      llmService,
      model,
      tools,
      baseToolNames,
      messageId,
      agentThread,
    } = options;
    const inWorkflow = await this.isInWorkflow();
    return [
      skillToolBindingMiddleware(this, {
        baseToolNames: Array.from(baseToolNames.values()),
      }),
      toolInteractionMiddleware(this, tools),
      toolCallStatusMiddleware(this),
      conversationMiddleware(this, {
        providerName,
        provider,
        llmService,
        model,
        messageId,
        agentThread,
      }),
      toolCallSanitizerMiddleware({ logger: this.logger }),
    ];
  }

  private async getCurrentThread(): Promise<AgentThread> {
    const aiConversation = await this.aiConversationsRepo.findOne({
      filter: { sessionId: this.sessionId },
    });
    if (!aiConversation) {
      throw new Error('Conversation not existed');
    }
    return AgentThread.newThread(
      aiConversation.sessionId,
      aiConversation.thread,
    );
  }

  private async forkCurrentThread(provider: LLMProvider): Promise<AgentThread> {
    let retTry = 3;
    const agent = await this.createAgent({ provider });
    let currentThread = await this.getCurrentThread();
    do {
      currentThread = currentThread.fork();
      const existedState = await agent.graph.getState({
        configurable: { thread_id: currentThread.threadId },
      });
      if (!existedState.config.configurable?.checkpoint_id) {
        return currentThread;
      }
    } while (retTry-- > 0);
    throw new Error('Fail to create new agent thread');
  }

  async getToolsMap() {
    const tools = await this.listTools({
      sessionId: this.sessionId,
    });
    return new Map(tools.map((tool) => [tool.definition.name, tool]));
  }

  private listTools(filter?: ToolsFilter) {
    return this.toolsManager.listTools({
      ...filter,
      ctx: this.ctx,
    });
  }

  private withRunMetadata(config?: any) {
    return {
      ...config,
      metadata: {
        ...(config?.metadata ?? {}),
        currentConversation: {
          sessionId: this.sessionId,
          from: this.from,
          username: this.employee.username,
        },
      },
    };
  }

  private get toolsManager(): ToolsManager {
    return this.ctx.ai.toolsManager;
  }

  private get aiConversationsRepo() {
    return this.ctx.repositories.aiConversations;
  }

  private get aiMessagesRepo() {
    return this.ctx.repositories.aiMessages;
  }

  private get aiToolMessagesRepo() {
    return this.ctx.repositories.aiToolMessages;
  }
}

function getCurrentTimezone(ctx: Context): string | undefined {
  const value =
    ctx.get?.('x-timezone') ||
    ctx.request?.get?.('x-timezone') ||
    ctx.request?.header?.['x-timezone'] ||
    ctx.req?.headers?.['x-timezone'] ||
    Intl.DateTimeFormat().resolvedOptions().timeZone;

  if (Array.isArray(value)) {
    return value[0];
  }

  return typeof value === 'string' ? value : undefined;
}

function getCurrentDateTimeForPrompt(
  locale: string | undefined,
  timezone?: string,
) {
  const now = new Date();
  const normalizedLocale = locale || 'en-US';

  try {
    const formatter = new Intl.DateTimeFormat(normalizedLocale, {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    return `${formatter.format(now)}${timezone ? ` (${timezone})` : ''}`;
  } catch (error) {
    return `${now.toISOString()}${timezone ? ` (${timezone})` : ''}`;
  }
}

class AgentThread {
  constructor(
    private readonly _sessionId: string,
    private readonly _thread: number,
  ) {}

  static newThread(sessionId: string, thread: number) {
    return new AgentThread(sessionId, thread);
  }

  get sessionId() {
    return this._sessionId;
  }

  get thread() {
    return this._thread;
  }

  get threadId() {
    return `${this._sessionId}:${this._thread}`;
  }

  fork(): AgentThread {
    return new AgentThread(this._sessionId, this._thread + 1);
  }
}

export class ChatStreamProtocol {
  private _statistics = {
    sent: 0,
    addSent: (s: number) => {
      this._statistics.sent += s;
    },
    reset: () => {
      this._statistics.sent = 0;
    },
  };

  constructor(
    private readonly streamConsumer: StreamConsumer,
    private readonly onWrite?: (chunk: string) => Promise<void>,
  ) {}

  static fromContext(ctx: Context, onWrite?: (chunk: string) => Promise<void>) {
    return new ChatStreamProtocol(ctx.res, onWrite);
  }

  with(conversation: { sessionId: string; from: string; username: string }) {
    const write = async ({ type, body }: { type: string; body?: any }) => {
      const { sessionId, from, username } = conversation;
      const data = `data: ${JSON.stringify({ sessionId, from, username, type, body })}\n\n`;
      await this.onWrite?.(data);
      this.streamConsumer.write(data);
      this._statistics.addSent(data.length);
    };

    return {
      startStream: async () => {
        this._statistics.reset();
        await write({ type: 'stream_start' });
      },

      endStream: async () => {
        await write({ type: 'stream_end' });
      },

      subAgentCompleted: async () => {
        await write({ type: 'sub_agent_completed' });
      },

      newMessage: async (content?: unknown) => {
        await write({ type: 'new_message', body: content });
      },

      content: async (content: string): Promise<void> => {
        await write({ type: 'content', body: content });
      },

      webSearch: async (content: { type: string; query: string }[]) => {
        await write({ type: 'web_search', body: content });
      },

      reasoning: async (content: { status: string; content: string }) => {
        await write({ type: 'reasoning', body: content });
      },

      stopReasoning: async () => {
        await write({
          type: 'reasoning',
          body: {
            status: 'stop',
            content: '',
          },
        });
      },

      toolCallChunks: async (content: unknown) => {
        await write({ type: 'tool_call_chunks', body: content });
      },

      toolCalls: async (content: unknown) => {
        await write({ type: 'tool_calls', body: content });
      },

      toolCallStatus: async ({
        toolCall,
        invokeStatus,
        status,
        invokeStartTime,
        invokeEndTime,
        content,
        interruptAction,
      }: {
        toolCall: {
          messageId: string;
          id: string;
          name: string;
          willInterrupt: boolean;
        };
        invokeStatus: string;
        status?: string;
        invokeStartTime?: string | Date | null;
        invokeEndTime?: string | Date | null;
        content?: unknown;
        interruptAction?: {
          order: number;
          description: string;
          allowedDecisions: string[];
        };
      }) => {
        await write({
          type: 'tool_call_status',
          body: {
            toolCall,
            invokeStatus,
            status,
            invokeStartTime,
            invokeEndTime,
            content,
            interruptAction,
          },
        });
      },
    };
  }

  get statistics() {
    return {
      sent: this._statistics.sent,
    };
  }
}

class ResponseMetadataCollector extends BaseCallbackHandler {
  name = 'ResponseMetadataCollector';
  constructor(
    private readonly llmProvider: LLMProvider,
    private readonly responseMetadata: Map<string, any>,
  ) {
    super();
  }

  handleLLMEnd(output: LLMResult, runId: string) {
    const [id, metadata] = this.llmProvider.parseResponseMetadata(output);
    if (id && metadata) {
      this.responseMetadata.set(id, metadata);
    }
  }

  getResponseMetadata(id: string) {
    return this.responseMetadata.get(id);
  }
}

export type StreamConsumer = {
  write: (chunk: any) => void;
};
