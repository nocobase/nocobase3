import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import type { LLMResult } from '@langchain/core/outputs';
import { concat } from '@langchain/core/utils/stream';
import { Command } from '@langchain/langgraph';
import { createAgent } from 'langchain';
import type { BaseCheckpointSaver } from '@langchain/langgraph';
import { buildTool } from '@nocobase/ai-employee';
import type {
  AgentContext,
  AIMessage,
  AIMessageInput,
  LLMProvider,
} from '@nocobase/ai-employee';
import type {
  AgentGraphState,
  AgentThread,
  AgentInterruptAction,
  AgentOperation,
  AgentProviders,
  AgentRequest,
  AgentStreamEvent,
  PreparedAgentContext,
  ResolvedAgentLLM,
} from './types.js';
import { AgentServiceError } from './types.js';
import { normalizeAgentError } from './errors.js';
import { buildStandardAgentMiddleware } from './middleware/pipeline.js';

const mergeSignals = (
  internal: AbortSignal,
  external?: AbortSignal,
): AbortSignal => {
  if (!external) return internal;
  if (typeof AbortSignal.any === 'function')
    return AbortSignal.any([internal, external]);
  const controller = new AbortController();
  const abort = (signal: AbortSignal) => controller.abort(signal.reason);
  if (internal.aborted) abort(internal);
  else
    internal.addEventListener('abort', () => abort(internal), { once: true });
  if (external.aborted) abort(external);
  else
    external.addEventListener('abort', () => abort(external), { once: true });
  return controller.signal;
};

type InterruptActionRequest = {
  name: string;
  description?: string;
};

type InterruptReviewConfig = {
  actionName: string;
  allowedDecisions?: string[];
};

type InterruptValue = {
  actionRequests?: InterruptActionRequest[];
  reviewConfigs?: InterruptReviewConfig[];
};

type Interrupt = {
  value?: InterruptValue;
};

const toInterruptActions = (interrupt: Interrupt): AgentInterruptAction[] => {
  const actions = interrupt.value?.actionRequests ?? [];
  const configs = new Map<string, InterruptReviewConfig>(
    (interrupt.value?.reviewConfigs ?? []).map(
      (item: InterruptReviewConfig) => [item.actionName, item],
    ),
  );
  return actions.flatMap((action: InterruptActionRequest, order: number) => {
    try {
      const payload: unknown = action.description
        ? JSON.parse(action.description)
        : {};
      if (payload === null || typeof payload !== 'object') return [];
      const value = payload as Record<string, unknown>;
      const toolCallId = value.toolCallId;
      const toolCallName = value.toolCallName;
      const sessionId = value.sessionId;
      return [
        {
          order,
          description: action.description,
          allowedDecisions: configs.get(action.name)?.allowedDecisions,
          toolCall:
            typeof toolCallId === 'string' && typeof toolCallName === 'string'
              ? { id: toolCallId, name: toolCallName }
              : undefined,
          currentConversation:
            typeof sessionId === 'string'
              ? {
                  sessionId,
                  from: typeof value.from === 'string' ? value.from : undefined,
                  username:
                    typeof value.username === 'string'
                      ? value.username
                      : undefined,
                }
              : undefined,
        },
      ];
    } catch {
      return [];
    }
  });
};

type ResponseMetadata = Record<string, unknown>;

class ExecutionResponseMetadata {
  private readonly metadata = new Map<string, ResponseMetadata>();
  private disposed = false;

  public collect(id: unknown, data: unknown): void {
    if (this.disposed || !id || !data || typeof data !== 'object') return;
    this.metadata.set(String(id), data as ResponseMetadata);
  }

  public take(id: string): ResponseMetadata | undefined {
    const data = this.metadata.get(id);
    this.metadata.delete(id);
    return data;
  }

  public dispose(): void {
    this.disposed = true;
    this.metadata.clear();
  }
}

class ResponseMetadataCollector extends BaseCallbackHandler {
  public name = 'ResponseMetadataCollector';

  public constructor(
    private readonly provider: LLMProvider,
    private readonly metadata: ExecutionResponseMetadata,
  ) {
    super();
  }

  public handleLLMEnd(output: LLMResult): void {
    const [id, data] = this.provider.parseResponseMetadata(output);
    this.metadata.collect(id, data);
  }
}

export class AgentService {
  private activeController?: AbortController;

  constructor(private readonly providers: AgentProviders) {}

  abort(reason?: unknown): void {
    if (!this.activeController?.signal.aborted)
      this.activeController?.abort(reason);
  }

  /** Resolves pending persisted tool calls before starting a new user turn. */
  cancelToolCall(): Promise<AIMessageInput[] | undefined> {
    return this.providers.conversation.messages.cancelToolCall();
  }

  stream(
    request: AgentRequest = {},
    agentContext?: AgentContext,
  ): AsyncGenerator<AgentStreamEvent> {
    return this.executeStream('stream', request, agentContext);
  }
  resumeStream(
    request: AgentRequest,
    agentContext?: AgentContext,
  ): AsyncGenerator<AgentStreamEvent> {
    return this.executeStream('resume', request, agentContext);
  }
  forkStream(
    request: AgentRequest,
    agentContext?: AgentContext,
  ): AsyncGenerator<AgentStreamEvent> {
    return this.executeStream('fork', request, agentContext);
  }
  invoke(
    request: AgentRequest = {},
    agentContext?: AgentContext,
  ): Promise<unknown> {
    return this.executeInvoke('invoke', request, agentContext);
  }
  resumeInvoke(
    request: AgentRequest,
    agentContext?: AgentContext,
  ): Promise<unknown> {
    return this.executeInvoke('resume', request, agentContext);
  }
  forkInvoke(
    request: AgentRequest,
    agentContext?: AgentContext,
  ): Promise<unknown> {
    return this.executeInvoke('fork', request, agentContext);
  }

  private resolveLLM(request: AgentRequest): Promise<ResolvedAgentLLM> {
    return this.providers.chatContext.resolveLLM(request);
  }

  private shouldFork(
    operation: AgentOperation,
    request: AgentRequest,
  ): boolean {
    return operation === 'fork' || Boolean(request.messageId);
  }

  private async forkThread(
    current: AgentThread | undefined,
    llmProvider: LLMProvider,
  ): Promise<AgentThread | undefined> {
    if (!current) return undefined;
    for (let attempt = 0; attempt < 4; attempt++) {
      const thread = current.thread + attempt + 1;
      const candidate: AgentThread = {
        sessionId: current.sessionId,
        thread,
        threadId: `${current.sessionId}:${thread}`,
      };
      if (!this.providers.checkpointer) return candidate;
      const agent = createAgent({
        model: llmProvider.createModel() as any,
        tools: [],
        checkpointer: this.providers.checkpointer as BaseCheckpointSaver,
      });
      const snapshot = await agent.graph.getState({
        configurable: { thread_id: candidate.threadId },
      });
      if (!snapshot.config.configurable?.checkpoint_id) return candidate;
    }
    throw new Error('Fail to create new agent thread');
  }

  private buildInitialState(messages: AIMessage[]): AgentGraphState {
    const assistantRole = this.providers.conversation.identity.username;
    const toolMessage = messages
      .slice()
      .reverse()
      .find((message) => message.toolCalls?.length);
    return {
      messageId: toolMessage?.messageId,
      lastMessageIndex: {
        lastHumanMessageIndex: messages.filter(
          (message) => message.role === 'user',
        ).length,
        lastAIMessageIndex: messages.filter((message) =>
          assistantRole
            ? message.role === assistantRole
            : message.role !== 'user' &&
              message.role !== 'tool' &&
              message.role !== 'system',
        ).length,
        lastToolMessageIndex: messages.filter(
          (message) => message.role === 'tool',
        ).length,
        lastMessageIndex: messages.length,
      },
    };
  }

  private useCheckpointer(): boolean {
    return Boolean(this.providers.checkpointer);
  }
  private async prepare(
    operation: AgentOperation,
    request: AgentRequest,
    llm: ResolvedAgentLLM,
    agentContext?: AgentContext,
    responseMetadataCollector?: BaseCallbackHandler,
  ): Promise<PreparedAgentContext> {
    const { conversation, chatContext, features } = this.providers;
    const shouldLoadHistory = Boolean(request.messageId);
    const history = shouldLoadHistory
      ? await conversation.messages.loadMessages(request.messageId)
      : [];
    const allMessages = [...history, ...(request.userMessages ?? [])];
    const formatted = await this.providers.chatMessageConverters.formatMessages(
      allMessages,
      llm,
    );
    const formattedSystemPrompt = formatted
      .filter((message: any) => message?.role === 'system')
      .map((message: any) => message.content)
      .filter(Boolean)
      .join('\n');
    const messages = formatted.filter(
      (message: any) => message?.role !== 'system',
    );
    const systemPrompt = features.contextEnrichment
      ? [
          await chatContext.getSystemPrompt(allMessages, request, llm),
          formattedSystemPrompt,
        ]
          .filter(Boolean)
          .join('\n\n') || undefined
      : formattedSystemPrompt || undefined;
    const sourceTools = features.tools
      ? await chatContext.discoveredTools(request)
      : [];
    const initialActiveToolNames = features.skills
      ? await chatContext.activeTools(request)
      : new Set(sourceTools.map((tool) => tool.definition.name));
    const resolvedTools = llm.provider.resolveTools(sourceTools.map(buildTool));
    let thread = await conversation.messages.currentThread();
    if (this.shouldFork(operation, request)) {
      thread = await this.forkThread(thread, llm.provider);
    }
    const state = shouldLoadHistory
      ? this.buildInitialState(history)
      : undefined;
    const input = request.userDecisions?.decisions?.length
      ? new Command({
          resume: request.userDecisions.interruptId
            ? {
                [request.userDecisions.interruptId]: {
                  decisions: request.userDecisions.decisions,
                },
              }
            : { decisions: request.userDecisions.decisions },
        })
      : messages.length
        ? { messages, ...(state ?? {}) }
        : null;
    const config = {
      context: {
        ...(request.context ?? {}),
        agentContext,
        agentRequest: request,
        decisions: request.userDecisions,
      },
      recursionLimit: 200,
      configurable:
        this.useCheckpointer() && thread
          ? { thread_id: thread.threadId }
          : undefined,
      writer: request.writer,
      signal: request.signal,
      ...(responseMetadataCollector
        ? { callbacks: [responseMetadataCollector] }
        : {}),
      metadata: { currentConversation: conversation.identity },
    };
    if (!config.configurable) delete config.configurable;
    return {
      input,
      systemPrompt,
      tools: resolvedTools,
      sourceTools,
      baseToolNames: new Set(initialActiveToolNames),
      initialActiveToolNames,
      llm,
      config,
      state,
      thread,
      checkpointer: this.useCheckpointer()
        ? this.providers.checkpointer
        : undefined,
      metadata: {
        currentConversation: conversation.identity,
        messageId: request.messageId,
      },
      providerName: llm.providerName,
      llmService: llm.llmService,
      model: llm.model,
      provider: llm.provider,
    };
  }

  private create(prepared: PreparedAgentContext) {
    return createAgent({
      model: prepared.provider.createModel(),
      tools: prepared.tools,
      middleware: buildStandardAgentMiddleware(this.providers, prepared),
      systemPrompt: prepared.systemPrompt,
      ...(prepared.checkpointer ? { checkpointer: prepared.checkpointer } : {}),
    });
  }

  private begin(request: AgentRequest) {
    const controller = new AbortController();
    const signal = mergeSignals(controller.signal, request.signal);
    const token = Symbol('agent-execution');
    this.activeController = controller;
    this.providers.conversation.registerAbortHandle(token, {
      signal,
      abort: (reason) => controller.abort(reason),
    });
    return { controller, signal, token };
  }

  private end(token: symbol, controller: AbortController): void {
    this.providers.conversation.unregisterAbortHandle(token);
    if (this.activeController === controller) this.activeController = undefined;
  }

  private async executeInvoke(
    operation: AgentOperation,
    request: AgentRequest,
    agentContext?: AgentContext,
  ): Promise<unknown> {
    const { conversation } = this.providers;
    const { controller, signal, token } = this.begin(request);
    await conversation.beforeExecution('invoking');
    let llm: ResolvedAgentLLM | undefined;
    try {
      llm = await this.resolveLLM(request);
      const prepared = await this.prepare(
        operation,
        { ...request, signal },
        llm,
        agentContext,
      );
      const result = await this.create(prepared).invoke(
        prepared.input as any,
        { ...prepared.config, signal } as any,
      );
      return result;
    } catch (error) {
      if ((error as any)?.name === 'GraphInterrupt') throw error;
      if (signal.aborted)
        throw new AgentServiceError('ABORTED', 'Agent execution aborted', {
          cause: error,
          aborted: true,
        });
      throw normalizeAgentError(error, 'Agent execution failed');
    } finally {
      this.end(token, controller);
      await conversation.afterExecution('invoking', {
        aborted: signal.aborted,
      });
      await llm?.dispose?.();
    }
  }

  private async *executeStream(
    operation: AgentOperation,
    request: AgentRequest,
    agentContext?: AgentContext,
  ): AsyncGenerator<AgentStreamEvent> {
    const { conversation } = this.providers;
    const identity = conversation.identity;
    const { controller, signal, token } = this.begin(request);
    const reasoning = new Set<string>();
    const messageIds = new Map<string, string>();
    let gathered: any;
    let sent = 0;
    let prepared: PreparedAgentContext | undefined;
    let activeProvider: LLMProvider | undefined;
    let llm: ResolvedAgentLLM | undefined;
    let responseMetadata: ExecutionResponseMetadata | undefined;
    await conversation.streamCache.clear();
    await conversation.beforeExecution('streaming');
    const stopReasoning = function* (
      target: typeof identity,
    ): Generator<AgentStreamEvent> {
      const key = `${target.sessionId}:${target.from ?? ''}:${target.username ?? ''}`;
      if (reasoning.delete(key))
        yield { type: 'reasoning', conversation: target, action: 'stop' };
    };
    try {
      llm = await this.resolveLLM(request);
      activeProvider = llm.provider;
      responseMetadata = new ExecutionResponseMetadata();
      const responseMetadataCollector = new ResponseMetadataCollector(
        llm.provider,
        responseMetadata,
      );
      prepared = await this.prepare(
        operation,
        { ...request, signal },
        llm,
        agentContext,
        responseMetadataCollector,
      );
      const stream = await this.create(prepared).stream(
        prepared.input as any,
        {
          ...prepared.config,
          signal,
          streamMode: ['updates', 'messages', 'custom'],
        } as any,
      );
      yield { type: 'stream_start', conversation: identity };
      for await (const [mode, chunks] of stream as any) {
        if (mode === 'messages') {
          const [chunk, metadata = {}] = chunks ?? [];
          const current = metadata.currentConversation ?? identity;
          if (chunk?.type !== 'ai') continue;
          gathered = gathered === undefined ? chunk : concat(gathered, chunk);
          const reasoningContent = activeProvider.parseReasoningContent(
            chunk as any,
          );
          if (reasoningContent) {
            const key = `${current.sessionId}:${current.from ?? ''}:${current.username ?? ''}`;
            const first = !reasoning.has(key);
            reasoning.add(key);
            sent++;
            yield {
              type: 'reasoning',
              conversation: current,
              action: first ? 'start' : 'content',
              content: reasoningContent,
            };
          }
          const content = chunk.content
            ? activeProvider.parseResponseChunk(chunk.content)
            : null;
          if (content) {
            yield* stopReasoning(current);
            sent++;
            yield { type: 'content', conversation: current, content };
          }
          if (chunk.tool_call_chunks?.length) {
            yield* stopReasoning(current);
            sent++;
            yield {
              type: 'tool_call_chunks',
              conversation: current,
              chunks: chunk.tool_call_chunks,
            };
          }
          const webSearch = activeProvider.parseWebSearchAction(chunk as any);
          if (webSearch?.length) {
            yield* stopReasoning(current);
            sent++;
            yield {
              type: 'web_search',
              conversation: current,
              body: webSearch,
            };
          }
        } else if (mode === 'updates') {
          const interrupt = chunks?.__interrupt__?.[0];
          if (interrupt?.id) {
            const actions = toInterruptActions(interrupt);
            for (const action of actions) {
              if (!action.toolCall || !action.currentConversation) continue;
              const messageId = messageIds.get(
                action.currentConversation.sessionId,
              );
              if (!messageId) continue;
              await conversation.messages.updateToolInterrupted(
                action.currentConversation.sessionId,
                messageId,
                action.toolCall.id,
                interrupt.id,
                action,
              );
              sent++;
              yield {
                type: 'tool_call_status',
                conversation: action.currentConversation,
                status: {
                  toolCall: { ...action.toolCall, messageId },
                  invokeStatus: 'interrupted',
                  interruptAction: action,
                },
              };
            }
            sent++;
            yield {
              type: 'interrupt_requested',
              conversation: identity,
              interruptId: interrupt.id,
              actions,
            };
          }
        } else if (mode === 'custom') {
          const current = chunks?.currentConversation ?? identity;
          if (chunks?.action === 'AfterAIMessageSaved') {
            if (chunks.body?.messageId)
              messageIds.set(current.sessionId, chunks.body.messageId);
            await conversation.streamCache.skipped();
            const metadata = chunks.body?.id
              ? responseMetadata.take(chunks.body.id)
              : undefined;
            if (metadata && chunks.body?.messageId)
              await conversation.updateAssistantResponseMetadata(
                chunks.body.messageId,
                metadata,
              );
            yield {
              type: 'message_persisted',
              conversation: current,
              messageId: chunks.body?.messageId,
              role: 'assistant',
            };
          } else if (chunks?.action === 'initToolCalls') {
            yield* stopReasoning(current);
            sent++;
            yield {
              type: 'tool_calls',
              conversation: current,
              toolCalls: chunks.body?.toolCalls ?? chunks.body ?? [],
            };
          } else if (
            chunks?.action === 'beforeToolCall' ||
            chunks?.action === 'afterToolCall' ||
            chunks?.action === 'afterToolCallError'
          ) {
            const toolCall = chunks.body?.toolCall;
            sent++;
            const invokeStatus =
              chunks.action === 'beforeToolCall'
                ? 'pending'
                : chunks.action === 'afterToolCallError'
                  ? 'error'
                  : 'done';
            yield {
              type: 'tool_call_status',
              conversation: current,
              status: {
                toolCall,
                invokeStatus,
                ...chunks.body?.toolCallResult,
              },
            };
          } else if (chunks?.action === 'beforeSendToolMessage') {
            const { messageId, messages = [] } = chunks.body ?? {};
            const results = await conversation.messages.listToolCallResult(
              messageId,
              messages.map(
                (item: { metadata: { toolCallId: string } }) =>
                  item.metadata.toolCallId,
              ),
            );
            for (const { metadata } of messages) {
              const result = results.get(metadata.toolCallId);
              sent++;
              yield {
                type: 'tool_call_status',
                conversation: current,
                status: {
                  toolCall: {
                    messageId,
                    id: metadata.toolCallId,
                    name: metadata.toolName,
                  },
                  invokeStatus: 'confirmed',
                  status: result?.status,
                  content: result?.content,
                  invokeStartTime: result?.invokeStartTime,
                  invokeEndTime: result?.invokeEndTime,
                },
              };
            }
            sent++;
            yield { type: 'new_message', conversation: current };
          } else if (chunks?.action === 'beforeSubAgentInvoke') {
            sent++;
            yield { type: 'sub_agent_started', conversation: current };
          } else if (chunks?.action === 'afterSubAgentInvoke') {
            sent++;
            yield { type: 'sub_agent_completed', conversation: current };
          }
        }
      }
      for (const key of [...reasoning]) {
        reasoning.delete(key);
        yield { type: 'reasoning', conversation: identity, action: 'stop' };
      }
      if (!sent && !signal.aborted)
        throw new AgentServiceError('EMPTY_RESPONSE', 'Empty response', {
          retryable: true,
        });
      yield { type: 'stream_end', conversation: identity };
    } catch (error) {
      for (const key of [...reasoning]) {
        reasoning.delete(key);
        yield { type: 'reasoning', conversation: identity, action: 'stop' };
      }
      if (signal.aborted) {
        if (gathered && prepared) {
          const value =
            await this.providers.chatMessageConverters.assistant.convert(
              gathered,
              prepared,
            );
          if (value) {
            value.metadata = {
              ...(value.metadata ?? {}),
              interrupted: true,
            } as any;
            await conversation.messages.saveAssistantMessage(value);
          }
        }
        throw new AgentServiceError('ABORTED', 'Agent execution aborted', {
          cause: error,
          aborted: true,
        });
      }
      throw normalizeAgentError(
        error,
        activeProvider?.parseResponseError(error),
      );
    } finally {
      this.end(token, controller);
      await conversation.afterExecution('streaming', {
        aborted: signal.aborted,
      });
      await conversation.streamCache.clear();
      await llm?.dispose?.();
    }
  }
}

export const createAgentService = (providers: AgentProviders): AgentService =>
  new AgentService(providers);
