import { concat } from '@langchain/core/utils/stream';
import { Command } from '@langchain/langgraph';
import { createAgent } from 'langchain';
import { buildTool } from '@nocobase/ai-employee';
import type {
  AgentInterruptAction,
  AgentLLMIdentity,
  AgentMessageConversionContext,
  AgentOperation,
  AgentProviders,
  AgentRequest,
  AgentStreamEvent,
  PreparedAgentContext,
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

const toInterruptActions = (interrupt: any): AgentInterruptAction[] => {
  const actions = interrupt?.value?.actionRequests ?? [];
  const configs = new Map(
    (interrupt?.value?.reviewConfigs ?? []).map((item) => [
      item.actionName,
      item,
    ]),
  );
  return actions.flatMap((action, order) => {
    try {
      const payload = action.description ? JSON.parse(action.description) : {};
      return [
        {
          order,
          description: action.description,
          allowedDecisions: (configs.get(action.name) as any)?.allowedDecisions,
          toolCall:
            payload.toolCallId && payload.toolCallName
              ? { id: payload.toolCallId, name: payload.toolCallName }
              : undefined,
          currentConversation: payload.sessionId
            ? {
                sessionId: payload.sessionId,
                from: payload.from,
                username: payload.username,
              }
            : undefined,
        },
      ];
    } catch {
      return [];
    }
  });
};

export class AgentService {
  private activeController?: AbortController;

  constructor(private readonly providers: AgentProviders) {}

  abort(reason?: unknown): void {
    if (!this.activeController?.signal.aborted)
      this.activeController?.abort(reason);
  }

  stream(request: AgentRequest = {}): AsyncGenerator<AgentStreamEvent> {
    return this.executeStream('stream', request);
  }
  resumeStream(request: AgentRequest): AsyncGenerator<AgentStreamEvent> {
    return this.executeStream('resume', request);
  }
  forkStream(request: AgentRequest): AsyncGenerator<AgentStreamEvent> {
    return this.executeStream('fork', request);
  }
  invoke(request: AgentRequest = {}): Promise<unknown> {
    return this.executeInvoke('invoke', request);
  }
  resumeInvoke(request: AgentRequest): Promise<unknown> {
    return this.executeInvoke('resume', request);
  }
  forkInvoke(request: AgentRequest): Promise<unknown> {
    return this.executeInvoke('fork', request);
  }

  private async resolveLLM(_request: AgentRequest): Promise<{
    provider: import('@nocobase/ai-employee').LLMProvider;
    identity: AgentLLMIdentity;
  }> {
    const provider = this.providers.llmProvider;
    const identity = this.providers.llmIdentity;
    return { provider, identity };
  }

  private async prepare(
    operation: AgentOperation,
    request: AgentRequest,
    llmContext: AgentMessageConversionContext,
  ): Promise<PreparedAgentContext> {
    const {
      conversation,
      chatContext,
      tools: toolProvider,
      features,
    } = this.providers;
    const shouldLoadHistory = conversation.messages.shouldLoadHistory(request);
    const history = shouldLoadHistory
      ? await conversation.messages.load(request.messageId)
      : [];
    const normalized = features.messageNormalization
      ? await chatContext.normalizeMessages(
          [...history, ...(request.userMessages ?? [])],
          request,
        )
      : [...history, ...(request.userMessages ?? [])];
    const formatted = await chatContext.formatMessages(normalized, llmContext);
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
          await chatContext.getSystemPrompt(normalized, request),
          formattedSystemPrompt,
        ]
          .filter(Boolean)
          .join('\n\n') || undefined
      : formattedSystemPrompt || undefined;
    const sourceTools = features.tools ? await toolProvider.listTools() : [];
    const baseToolNames = features.skills
      ? await toolProvider.getBaseToolNames(sourceTools)
      : new Set(sourceTools.map((tool) => tool.definition.name));
    const resolvedTools = llmContext.provider.resolveTools(
      sourceTools.map(buildTool),
    );
    let thread = await conversation.threads.current();
    if (conversation.threads.shouldFork(operation, request)) {
      thread = await conversation.threads.fork(llmContext.provider);
    }
    const state = shouldLoadHistory
      ? conversation.threads.buildInitialState(history)
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
    const context = await chatContext.getExecutionContext(request);
    const config = {
      context: {
        ...context,
        agentRequest: request,
        decisions: request.userDecisions,
      },
      recursionLimit: 200,
      configurable:
        conversation.threads.useCheckpointer() && thread
          ? { thread_id: thread.threadId }
          : undefined,
      writer: request.writer,
      signal: request.signal,
      ...(await chatContext.getExecutionConfig(request)),
      metadata: { currentConversation: conversation.identity },
    };
    if (!config.configurable) delete config.configurable;
    return {
      input,
      systemPrompt,
      tools: resolvedTools,
      sourceTools,
      baseToolNames,
      config,
      state,
      thread,
      checkpointer: conversation.threads.useCheckpointer()
        ? this.providers.checkpointer
        : undefined,
      metadata: {
        currentConversation: conversation.identity,
        messageId: request.messageId,
      },
      providerName: llmContext.providerName,
      llmService: llmContext.llmService,
      model: llmContext.model,
      provider: llmContext.provider,
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
  ): Promise<unknown> {
    const { conversation } = this.providers;
    const { controller, signal, token } = this.begin(request);
    await conversation.beforeExecution('invoking');
    try {
      const llm = await this.resolveLLM(request);
      const prepared = await this.prepare(
        operation,
        { ...request, signal },
        { ...llm.identity, provider: llm.provider },
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
    }
  }

  private async *executeStream(
    operation: AgentOperation,
    request: AgentRequest,
  ): AsyncGenerator<AgentStreamEvent> {
    const { conversation } = this.providers;
    const identity = conversation.identity;
    const { controller, signal, token } = this.begin(request);
    const reasoning = new Set<string>();
    const messageIds = new Map<string, string>();
    let gathered: any;
    let sent = 0;
    let prepared: PreparedAgentContext | undefined;
    let activeProvider: import('@nocobase/ai-employee').LLMProvider | undefined;
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
      const llm = await this.resolveLLM(request);
      activeProvider = llm.provider;
      prepared = await this.prepare(
        operation,
        { ...request, signal },
        { ...llm.identity, provider: llm.provider },
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
              await conversation.toolCalls.markInterrupted(
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
              ? this.providers.llmIdentity.getResponseMetadata?.(chunks.body.id)
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
            const results = await conversation.toolCalls.getMany(
              messageId,
              messages.map((item) => item.metadata.toolCallId),
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
          const value = this.providers.chatContext.convertAIMessage(
            gathered,
            prepared,
          );
          if (value) {
            value.metadata = {
              ...(value.metadata ?? {}),
              interrupted: true,
            } as any;
            await conversation.messages.saveInterruptedAssistantMessage(value);
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
    }
  }
}

export const createAgentService = (providers: AgentProviders): AgentService =>
  new AgentService(providers);
