import type { Context } from '../../internal/runtime-context.js';
import type { RepositoryFactory } from '../../repository/database/factory.js';
import type { AIEmployeesManager } from '../../managers/ai-employees-manager.js';
import type { BuiltInManager } from '../../managers/built-in-manager.js';
import type { KnowledgeBaseManager } from '../../managers/knowledge-base-manager.js';
import type { LLMStreamCachedManager } from '../../managers/llm-stream-cached-manager.js';
import type { WorkContextHandler } from '../../managers/work-context/index.js';
import type { DocumentLoaders } from '@nocobase/ai-employee';
import type { ToolsEntity } from '@nocobase/ai-employee';
import type { SkillsEntity } from '@nocobase/ai-employee';
/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { AIToolMessageEntity } from '../../repository/index.js';
import type { DatabaseConnection } from '@nocobase/db';
import { LLMProvider } from '@nocobase/ai-employee';
import { getSystemPrompt } from '../../ai-employees/prompts.js';
import _ from 'lodash';
import { AIChatConversation, AIMessageInput } from '@nocobase/ai-employee';
import { createAIChatConversation } from '../../ai-employees/ai-chat-conversation.js';
import type { AIEmployee as AIEmployeeType } from '@nocobase/ai-employee';
import { listSystemTools, SYSTEM_TOOLS } from '@nocobase/ai-employee';
import {
  getCurrentRoleNames,
  getKnowledgeBaseBackgroundPrompt,
  normalizeKnowledgeBaseRetrievalStrategy,
} from '../../managers/knowledge-base-manager.js';

import type { ToolsFilter, ToolsManager } from '@nocobase/ai-employee';
import {
  listAccessibleAIEmployees,
  serializeEmployeeSummary,
} from '../../managers/sub-agents/shared.js';
import { sanitizeAdditionalKwargsForToolCalls } from '../../ai-employees/tool-call-sanitizer.js';
import {
  findMessageAttachments,
  getAttachmentSource,
  getMessageAttachmentLookupKey,
  shouldSkipAttachmentSourceLookup,
} from '../../ai-employees/attachments.js';
import {
  EXECUTE_FRONTEND_TOOL_NAME,
  LOAD_FRONTEND_TOOL_NAME,
} from '../../ai-employees/common/frontend-tools.js';
import {
  listCurrentFrontendTools,
  prepareToolsForFrontendConversation,
  shouldAutoExecuteFrontendTool,
} from '../../ai-employees/frontend-tools.js';

export interface ModelRef {
  llmService: string;
  model: string;
}

export interface AIEmployeeOptions {
  ctx: Context;
  repositories: RepositoryFactory;
  aiEmployeesManager: AIEmployeesManager;
  builtInManager: BuiltInManager;
  llmStreamCachedManager: LLMStreamCachedManager;
  knowledgeBaseManager: KnowledgeBaseManager;
  workContextHandler: WorkContextHandler;
  documentLoaders: DocumentLoaders;
  employee: any;
  sessionId: string;
  systemMessage?: string;
  skillSettings?: Record<string, any>;
  webSearch?: boolean;
  model?: ModelRef;
  legacy?: boolean;
  from?: 'main-agent' | 'sub-agent';
  tools?: { name: string }[];
}

export class AIEmployeeCapabilities {
  sessionId: string;
  from = 'main-agent';
  employee: any;
  aiChatConversation: AIChatConversation;
  skillSettings?: Record<string, any>;
  userMessageCount = 0;

  private ctx: Context;
  private repositories: RepositoryFactory;
  private builtInManager: BuiltInManager;
  private knowledgeBaseManager: KnowledgeBaseManager;
  private workContextHandler: WorkContextHandler;
  private documentLoaders: DocumentLoaders;
  private systemMessage?: string;
  private webSearch?: boolean;
  private model?: ModelRef;
  private tools: { name: string }[];

  constructor({
    ctx,
    repositories,
    builtInManager,
    knowledgeBaseManager,
    workContextHandler,
    documentLoaders,
    employee,
    sessionId,
    systemMessage,
    skillSettings,
    webSearch,
    model,
    from = 'main-agent',
    tools = [],
  }: AIEmployeeOptions) {
    this.employee = employee;
    this.ctx = ctx;
    this.repositories = repositories;
    this.builtInManager = builtInManager;
    this.knowledgeBaseManager = knowledgeBaseManager;
    this.workContextHandler = workContextHandler;
    this.documentLoaders = documentLoaders;
    this.sessionId = sessionId;
    this.systemMessage = systemMessage;
    this.aiChatConversation = createAIChatConversation(
      this.ctx,
      this.repositories,
      this.sessionId,
    );
    this.skillSettings = skillSettings;
    this.model = model;
    this.from = from;
    this.tools = tools;
    this.builtInManager.setupBuiltInInfo(
      ctx,
      this.employee as unknown as AIEmployeeType,
    );
    this.webSearch = webSearch;
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

  private getRequiredModel(): ModelRef {
    if (!this.model) {
      throw new Error('AI employee model is required');
    }
    return this.model;
  }

  async getFormatMessages(userMessages: AIMessageInput[]) {
    const { provider } = await this.ctx.ai.llmProviderManager.getLLMService(
      this.getRequiredModel(),
    );
    const { messages } = await this.aiChatConversation.getChatContext({
      userMessages,
      formatMessages: (messages) => this.formatMessages({ messages, provider }),
    });
    return messages;
  }

  // Agent execution and middleware orchestration are owned by AgentService.
  // === Prompts & knowledge base ===
  async getSystemPrompt(userMessages: AIMessageInput[]) {
    if (this.systemPromptMode === 'none') {
      return '';
    }

    const about = this.employee.about ?? this.employee.defaultPrompt ?? '';
    if (this.systemPromptMode === 'raw') {
      return about;
    }

    const userConfig = await this.repositories.usersAiEmployees.findOne({
      filter: {
        userId: this.ctx.auth?.user?.id ?? 0,
        aiEmployee: this.employee.username,
      },
    });

    let background = '';
    if (this.systemMessage) {
      background = this.systemMessage;
    }

    const aiMessages = await this.aiChatConversation.listMessages();
    const workContextBackground = await this.workContextHandler.background(
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

    const knowledgeBaseManager = this.knowledgeBaseManager;
    const employee = this.employee as unknown as AIEmployeeType;
    const knowledgeBaseEnabled =
      await knowledgeBaseManager.isEnabledKnowledgeBase(employee);
    const roleNames = getCurrentRoleNames(this.ctx.state);
    const hasAccessibleKnowledgeBase = knowledgeBaseEnabled
      ? await knowledgeBaseManager.hasAccessibleKnowledgeBase({
          employee,
          roleNames,
        })
      : false;
    const knowledgeBaseAccessDenied =
      knowledgeBaseEnabled && !hasAccessibleKnowledgeBase;
    const knowledgeBaseOnDemand =
      knowledgeBaseEnabled &&
      hasAccessibleKnowledgeBase &&
      normalizeKnowledgeBaseRetrievalStrategy(
        employee.knowledgeBase?.retrievalStrategy,
      ) === 'onDemand';

    let knowledgeBase: string | undefined;
    if (
      knowledgeBaseEnabled &&
      hasAccessibleKnowledgeBase &&
      !knowledgeBaseOnDemand &&
      userMessages?.length
    ) {
      const lastUserMessage = userMessages
        .filter((message) => message.role === 'user')
        .at(-1);
      if (lastUserMessage) {
        knowledgeBase = await knowledgeBaseManager.retrievePrompt({
          employee,
          query: lastUserMessage.content.content as string,
          roleNames,
        });
      }
    }
    const knowledgeBaseBackgroundPrompt = getKnowledgeBaseBackgroundPrompt({
      accessDenied: knowledgeBaseAccessDenied,
      onDemand: knowledgeBaseOnDemand,
      preRetrieved: Boolean(knowledgeBase),
    });
    if (knowledgeBaseBackgroundPrompt) {
      background = `${background}\n${knowledgeBaseBackgroundPrompt}`;
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

    const { important } = this.ctx.requestExecution ?? {};
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
      ? await listCurrentFrontendTools(this.repositories, {
          ...this.ctx.requestExecution,
          sessionId: this.sessionId,
        })
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
            messageId,
            toolCallId: toolCall.id,
            toolName: toolCall.name,
            status: toolsExisted ? (null as unknown as string) : 'error',
            content: toolsExisted
              ? (null as unknown as string)
              : `Tool ${toolCall.name} not found`,
            invokeStatus: toolsExisted ? 'init' : 'done',
            invokeStartTime: toolsExisted ? (null as unknown as Date) : nowTime,
            invokeEndTime: toolsExisted ? (null as unknown as Date) : nowTime,
            auto,
            execution: tools?.execution ?? 'backend',
          };
        }),
      },
      { connection: transaction },
    )) as AIToolMessageEntity[];
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
    return await this.ctx.database.transaction(async (transaction) => {
      const updated = await this.aiToolMessagesRepo.update(
        {
          values: {
            invokeStatus: 'interrupted',
            interruptActionOrder: interruptAction.order,
            interruptAction,
          },
          filter: { sessionId, messageId, toolCallId, invokeStatus: 'init' },
        },
        { connection: transaction },
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
        { connection: transaction },
      );

      if (!message) {
        return updated;
      }

      await this.aiMessagesRepo.update(
        {
          values: { metadata: { ...(message.metadata ?? {}), interruptId } },
          filter: { messageId, sessionId },
        },
        { connection: transaction },
      );

      return updated;
    });
  }

  async updateToolCallPending(messageId: string, toolCallId: string) {
    const updated = await this.aiToolMessagesRepo.update({
      values: { invokeStatus: 'pending', invokeStartTime: new Date() },
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
        values: { invokeStatus: 'confirmed' },
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
  ): Promise<AIToolMessageEntity | null> {
    return await this.aiToolMessagesRepo.findOne({
      filter: { messageId, toolCallId },
    });
  }

  async getToolCallResultMap(
    messageId: string,
    toolCallIds: string[],
  ): Promise<Map<string, AIToolMessageEntity>> {
    const list: AIToolMessageEntity[] = await this.aiToolMessagesRepo.find({
      filter: {
        messageId,
        toolCallId: {
          $in: toolCallIds,
        },
      },
    });
    const result = new Map<string, AIToolMessageEntity>();
    for (const item of list) {
      if (item.toolCallId) {
        result.set(item.toolCallId, item);
      }
    }
    return result;
  }

  async cancelToolCall(
    reason = 'The user ignored the application for tools usage and will continued to ask questions',
  ) {
    let messageId;
    const historyMessages = await this.repositories.aiMessages.find({
      sort: ['-messageId'],
    });
    const [lastMessage] = historyMessages;
    if (lastMessage?.toolCalls?.length ?? 0 > 0) {
      messageId = lastMessage.messageId;
    } else {
      return;
    }
    const toolMessages: AIToolMessageEntity[] =
      await this.aiToolMessagesRepo.find({
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
      await this.ctx.ai.llmProviderManager.getLLMService(
        this.getRequiredModel(),
      );
    const toolCallMap = await this.getToolCallMap(messageId);
    const now = new Date();
    const toolMessageContent = reason;
    return await this.ctx.database.transaction(async (transaction) => {
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
          { connection: transaction },
        );
      }
      return await this.repositories.aiMessages.create(
        {
          values: toolMessages.map((toolMessage) => ({
            messageId: String(this.ctx.snowflake.generate()),
            role: 'tool',
            content: {
              type: 'text',
              content: toolMessageContent,
            },
            metadata: {
              model,
              provider: service.provider,
              toolCall: toolMessage.toolCallId
                ? toolCallMap.get(toolMessage.toolCallId)
                : undefined,
              toolCallId: toolMessage.toolCallId,
              sourceMessageId: messageId,
              autoCall: toolMessage.auto,
            },
          })),
        },
        { connection: transaction },
      );
    });
  }

  get logger() {
    return this.ctx.logger;
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

  shouldInterruptToolCall(tools?: ToolsEntity): boolean {
    return tools?.execution === 'frontend' || !this.isAutoCall(tools);
  }

  isAutoCall(tools?: ToolsEntity): boolean {
    if (!tools) {
      return false;
    }
    const isAutoCall = tools.defaultPermission === 'ALLOW';
    if (tools.scope !== 'CUSTOM') {
      return isAutoCall;
    }
    const employeeTools: { name: string; autoCall?: boolean }[] =
      this.employee.skillSettings?.tools ?? [];
    const presetTools = employeeTools.find(
      (setting) => setting.name === tools.definition.name,
    );
    return presetTools ? presetTools.autoCall === true : isAutoCall;
  }

  async normalizeMessages(
    messages: AIMessageInput[],
  ): Promise<AIMessageInput[]> {
    return this.normalizeMessageAttachments(messages);
  }

  private async normalizeMessageAttachments(
    messages: AIMessageInput[],
  ): Promise<AIMessageInput[]> {
    const attachments = messages
      .filter((message) => Array.isArray(message.attachments))
      .flatMap((message) => message.attachments);

    if (!attachments.length) return messages;

    const attachmentsByLookup = await findMessageAttachments(
      this.ctx,
      this.repositories,
      attachments,
    );
    return messages.map((message) => {
      if (!Array.isArray(message.attachments) || !message.attachments.length)
        return message;
      return {
        ...message,
        attachments: message.attachments.flatMap((attachment) => {
          const source = getAttachmentSource(attachment);
          if (!source || shouldSkipAttachmentSourceLookup(source))
            return [attachment];
          const lookupKey = getMessageAttachmentLookupKey(attachment);
          const verifiedAttachment = lookupKey
            ? attachmentsByLookup.get(lookupKey)
            : null;
          return verifiedAttachment ? [{ ...verifiedAttachment, source }] : [];
        }),
      };
    });
  }

  async formatMessages({
    messages,
    provider,
  }: {
    messages: AIMessageInput[];
    provider: LLMProvider;
  }) {
    const formattedMessages = [];
    const workContextHandler = this.workContextHandler;
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
              fileStorage: this.ctx.fileStorage,
              documentLoader: this.documentLoaders.cached,
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
    const message = await this.aiMessagesRepo.findOne({
      filter: { messageId },
    });
    const toolCalls = message?.toolCalls;
    if (!toolCalls) {
      return result;
    }
    for (const toolCall of toolCalls) {
      result.set(toolCall.id, toolCall);
    }
    return result;
  }

  private async getKnowledgeBaseRetrieveTool(): Promise<
    ToolsEntity | undefined
  > {
    const employee = this.employee as unknown as AIEmployeeType;
    const knowledgeBaseManager = this.knowledgeBaseManager;
    if (!(await knowledgeBaseManager.isEnabledKnowledgeBase(employee))) {
      return undefined;
    }
    const hasAccessibleKnowledgeBase =
      await knowledgeBaseManager.hasAccessibleKnowledgeBase({
        employee,
        roleNames: getCurrentRoleNames(this.ctx.state),
      });
    if (!hasAccessibleKnowledgeBase) {
      return undefined;
    }
    return this.toolsManager.getTools(SYSTEM_TOOLS.KNOWLEDGE_BASE, {
      ctx: this.ctx,
    });
  }

  private async getAIEmployeeTools() {
    if (!this.areToolsEnabled()) {
      return [];
    }
    const currentFrontendTools = await listCurrentFrontendTools(
      this.repositories,
      {
        ...this.ctx.requestExecution,
        sessionId: this.sessionId,
      },
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
      if (subAgentWebSearch) {
        tools.push(subAgentWebSearch);
      }
    }
    const generalToolsNameSet = new Set(tools.map((x) => x.definition.name));
    const toolMap = await this.getToolsMap();
    const settingsTools = this.employee.skillSettings?.tools ?? [];
    const employeeTools = [...settingsTools, ...this.tools];
    const knowledgeBaseRetrieveTool = await this.getKnowledgeBaseRetrieveTool();
    if (knowledgeBaseRetrieveTool) {
      employeeTools.push({ name: SYSTEM_TOOLS.KNOWLEDGE_BASE });
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

  async getAgentTools(): Promise<{
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
    const list = (await this.aiToolMessagesRepo.find({
      filter: {
        sessionId: this.sessionId,
        toolName: 'getSkill',
        status: 'success',
      },
      sort: ['id'],
    })) as AIToolMessageEntity[];
    const result = new Set<string>();
    for (const item of list) {
      const { content } = item;
      if (content && typeof content === 'object') {
        const skillName = (content as Record<string, unknown>).skillName;
        if (typeof skillName === 'string') {
          result.add(skillName);
          continue;
        }
      }
      if (typeof content === 'string') {
        try {
          const parsed: unknown = JSON.parse(content);
          if (parsed && typeof parsed === 'object') {
            const skillName = (parsed as Record<string, unknown>).skillName;
            if (typeof skillName === 'string') {
              result.add(skillName);
            }
          }
        } catch {
          // Ignore unexpected plain-string content.
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
    const availableAIEmployees = (
      await listAccessibleAIEmployees(this.ctx, this.repositories)
    )
      .map((employee) =>
        serializeEmployeeSummary(this.ctx, this.builtInManager, employee),
      )
      .filter((it) => it.username !== this.employee.username);
    return availableAIEmployees;
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

  private get toolsManager(): ToolsManager {
    return this.ctx.ai.toolsManager;
  }

  private get aiConversationsRepo() {
    return this.repositories.aiConversations;
  }

  private get aiMessagesRepo() {
    return this.repositories.aiMessages;
  }

  private get aiToolMessagesRepo() {
    return this.repositories.aiToolMessages;
  }
}

function getCurrentTimezone(ctx: Context): string | undefined {
  const value =
    ctx.requestExecution?.timezone ||
    ctx.get?.('x-timezone') ||
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
