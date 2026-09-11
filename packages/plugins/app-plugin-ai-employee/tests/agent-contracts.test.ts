import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  AgentServiceError,
  DEFAULT_AGENT_FEATURES,
  STANDARD_AGENT_MIDDLEWARE_ORDER,
  type AgentStreamEvent,
  type ChatContextProvider,
  type CurrentConversation,
  type DiscoveredTools,
  type ResolvedAgentLLM,
} from '../server/agent/types.js';
import { AIEmployeesManager } from '../server/manager/ai-employees-manager.js';
import { createAgentProviders } from '../server/agent/providers.js';
import { createTestConversationProvider } from './test-conversation-provider.js';
import { DefaultChatMessageConverters } from '../server/agent/chat-message-converters.js';
import {
  encodeAgentEventSSE,
  toLegacyAgentEventPayload,
} from '../server/agent/sse.js';

const src = path.resolve(import.meta.dirname, '../server');
const read = (relative: string) =>
  fs.readFileSync(path.join(src, relative), 'utf8');
const aiSrc = path.resolve(import.meta.dirname, '../ai');
const readAISources = (): string =>
  fs
    .readdirSync(aiSrc, { recursive: true })
    .filter(
      (file): file is string =>
        typeof file === 'string' && file.endsWith('.ts'),
    )
    .map((file) => fs.readFileSync(path.join(aiSrc, file), 'utf8'))
    .join('\n');

const llmProvider = {
  createModel: vi.fn(),
  resolveTools: vi.fn(() => []),
} as any;

describe('fixed AgentService contracts', () => {
  it('owns response metadata lifecycle inside each AgentService stream execution', () => {
    const types = read('agent/types.ts');
    const service = read('agent/agent-service.ts');
    const employeeProviders = read('agent/ai-employee/providers.ts');

    const resolvedLLM = types.slice(
      types.indexOf('export interface ResolvedAgentLLM'),
      types.indexOf('export type AgentMessageConversionContext'),
    );
    const chatContextProvider = types.slice(
      types.indexOf('export interface ChatContextProvider'),
      types.indexOf('export interface AgentProviders'),
    );

    expect(resolvedLLM).not.toMatch(/takeResponseMetadata|dispose/);
    expect(chatContextProvider).not.toContain('getExecutionConfig');
    expect(employeeProviders).not.toMatch(
      /ExecutionResponseMetadata|ResponseMetadataCollector|responseMetadataCollector/,
    );

    expect(service).toContain('class ExecutionResponseMetadata');
    expect(service).toContain('class ResponseMetadataCollector');
    expect(service).toMatch(
      /new ResponseMetadataCollector\(\s*llm\.provider,\s*responseMetadata,?\s*\)/,
    );
    expect(service).toContain('responseMetadata.take(');
    expect(service).toContain('responseMetadata?.dispose()');
    expect(service).not.toMatch(
      /class AgentService[\s\S]*private readonly responseMetadata/,
    );

    const llmProviderContract = fs.readFileSync(
      path.resolve(
        import.meta.dirname,
        '../../../libs/ai-employee/src/llm-providers/provider.ts',
      ),
      'utf8',
    );
    expect(llmProviderContract).toContain('parseResponseMetadata(');
    expect(types).toContain('updateMessage(');
  });

  it('keeps transactions and arbitrary middleware out of public providers', () => {
    const source = read('agent/types.ts');
    expect(source).not.toMatch(
      /RuntimeTransaction|Sequelize.*Transaction|middleware:\s*NonNullable/,
    );
    const prepared = source.slice(
      source.indexOf('export interface PreparedAgentContext'),
      source.indexOf('export interface AgentFeatureOptions'),
    );
    expect(prepared).not.toMatch(/\bmiddleware\??:/);
  });

  it('keeps thread execution policy private to AgentService', () => {
    const types = read('agent/types.ts');
    const service = read('agent/agent-service.ts');
    const providerSources = [
      'agent/providers.ts',
      'agent/ai-employee/providers.ts',
    ]
      .map(read)
      .join('\n');

    for (const method of [
      'shouldFork',
      'buildInitialState',
      'useCheckpointer',
    ]) {
      expect(types).not.toContain(`${method}(`);
      expect(providerSources).not.toContain(`${method}(`);
      expect(service).toContain(`private ${method}(`);
    }
  });
  it('keeps request-derived execution details out of chat context providers', () => {
    const providerSources = [
      'agent/providers.ts',
      'agent/ai-employee/providers.ts',
      'agent/types.ts',
    ]
      .map(read)
      .join('\n');
    expect(providerSources).not.toContain('getExecutionContext');
    expect(providerSources).not.toContain('getUserMessageCount');
    const types = read('agent/types.ts');
    expect(types).toMatch(
      /getSystemPrompt\(\s*messages: readonly AIMessageInput\[\],?\s*\): Promise<string \| undefined>/,
    );
    expect(read('agent/agent-service.ts')).toContain(
      'chatContext.getSystemPrompt(allMessages)',
    );
    expect(read('agent/agent-service.ts')).toContain(
      '...(request.context ?? {})',
    );
  });

  it('resolves the AI employee model from each AgentRequest', () => {
    const types = read('agent/types.ts');
    const options = read('agent/ai-employee/options.ts');
    const providers = read('agent/ai-employee/providers.ts');
    const conversationService = read('service/ai-conversation-service.ts');
    const subAgentDispatcher = read('manager/sub-agents/dispatcher.ts');

    expect(types).toContain('model?: ModelRef');
    expect(options).not.toContain('model?: ModelRef');
    expect(providers).not.toContain('private readonly model');
    expect(providers).not.toContain('model: options.model');
    expect(providers).toContain('getLLMService(request.model)');
    expect(conversationService).toContain(
      'const agentRequest = { ...request, model: resolvedModel }',
    );
    expect(conversationService).toContain(
      '{ model: resolvedModel, userDecisions }',
    );
    expect(subAgentDispatcher).toMatch(
      /agent\.invoke\(\s*\{\s*userDecisions:[\s\S]*?model: resolvedModel,/,
    );
  });

  it('keeps AI chat conversation ownership in the conversation provider', () => {
    const providers = read('agent/ai-employee/providers.ts');
    const chatConversation = read('agent/ai-employee/ai-chat-conversation.ts');
    expect(fs.existsSync(path.join(src, 'agent/ai-employee/runtime.ts'))).toBe(
      false,
    );
    expect(providers).toContain(
      'const chatConversation = createAIChatConversation({',
    );
    expect(chatConversation).toContain('messages: AIMessageRepository');
    expect(chatConversation).not.toContain('RepositoryFactory');
    expect(chatConversation).not.toContain('repositories');
  });

  it('removes the empty message normalization contract and middleware stage', () => {
    const types = read('agent/types.ts');
    const service = read('agent/agent-service.ts');
    const providerSources = [
      'agent/providers.ts',
      'agent/ai-employee/providers.ts',
    ]
      .map(read)
      .join('\n');
    const pipeline = read('agent/middleware/pipeline.ts');

    expect(types).not.toContain('normalizeMessages');
    expect(types).not.toContain('messageNormalization');
    expect(types).not.toContain('MessageNormalizationMiddleware');
    expect(providerSources).not.toContain('normalizeMessages');
    expect(service).not.toContain('normalizeMessages');
    expect(service).not.toContain('messageNormalization');
    expect(service).toContain(
      'const allMessages = [...history, ...(request.userMessages ?? [])];',
    );
    expect(service).toContain('this.providers.converters.formatMessages(');
    expect(pipeline).not.toContain('MessageNormalizationMiddleware');
  });

  it('forbids legacy provider bridges and runtime-owned context responsibilities', () => {
    const production = [
      'agent/types.ts',
      'agent/providers.ts',
      'agent/agent-service.ts',
      'agent/ai-employee/providers.ts',
      'agent/ai-employee/conversation-message-store.ts',
      'agent/middleware/pipeline.ts',
    ]
      .map(read)
      .join('\n');
    const toolCallStore = read(
      'agent/ai-employee/conversation-message-store.ts',
    );
    expect(production).not.toMatch(/\bToolProvider\b/);
    expect(production).not.toContain('createDefaultToolProvider');
    expect(production).not.toContain('createAIEmployeeToolProvider');
    expect(production).not.toContain('providers.llmProvider');
    expect(production).not.toContain('providers.llmIdentity');
    expect(production).not.toContain('providers.tools');
    expect(production).not.toContain('DirectChatContextProvider');
    expect(toolCallStore).not.toMatch(
      /getSystemPrompt|getAgentTools|getAvailableSkills/,
    );
    expect(toolCallStore).not.toMatch(/getActivatedSkillToolNames/);
    expect(toolCallStore).not.toMatch(
      /public\s+(?:async\s+)?(?:getToolsMap|shouldInterruptToolCall|isAutoCall)\s*\(/,
    );
    expect(read('agent/ai-employee/providers.ts')).not.toMatch(
      /activeProvider|activeIdentity/,
    );
    expect(production).not.toMatch(
      /Object\.assign\([^)]*(chatContext|converter)/,
    );
    expect(production).not.toMatch(/\.\.\.(options\.)?chatContext/);
    expect(read('agent/chat-message-converters.ts')).toContain(
      "from './ai-employee/options.js'",
    );
    const types = read('agent/types.ts');
    expect(types).toContain('export interface DiscoveredTools');
    expect(types).toContain('readonly tools: ReadonlyMap<string, ToolsEntity>');
    expect(types).toContain('activeTools(): Promise<ReadonlySet<string>>');
    expect(types).not.toContain('initialActiveToolNames');
    expect(types).not.toContain('baseToolNames');
    const skillMiddleware = read('agent/middleware/skill-tools.ts');
    expect(skillMiddleware).toContain('discoveredTools.activeTools()');
    expect(skillMiddleware).not.toContain('options.request');
    expect(skillMiddleware).toContain('wrapModelCall');
    expect(skillMiddleware).toContain('wrapToolCall');
  });

  it('keeps tool-call cancellation behind the unified AgentService contract', () => {
    const service = read('agent/agent-service.ts');
    const providers = read('agent/ai-employee/providers.ts');
    const factory = read('agent/ai-employee/index.ts');
    const types = read('agent/types.ts');

    expect(service).toContain(
      'this.providers.conversation.messages.cancelToolCall()',
    );
    expect(providers).not.toContain(['AIEmployeeAgent', 'Facade'].join(''));
    expect(providers).not.toContain('AIEmployeeAgentProvidersResult');
    expect(providers).not.toContain(['getToolCall', 'Handler'].join(''));
    expect(providers).not.toMatch(/return\s*\{\s*providers,?\s*facade/s);
    expect(factory).not.toContain('interface AIEmployeeAgentService');
    expect(factory).not.toContain('facade');
    expect(factory).toContain('Promise<AgentService>');
    expect(types).not.toContain('export interface ToolCallHandler');
    expect(types).not.toContain('ConversationToolCallStore');
    expect(types).toContain('updateToolInterrupted(');
    expect(types).toContain('updateToolPending(');
    expect(types).toContain('updateToolDone(');
    expect(types).toContain('updateToolError(');
    expect(types).toContain('cancelToolCall()');
    expect(types).toContain('getToolCallResult(');
    expect(types).toContain('listToolCallResult(');
    expect(providers).not.toContain('async function initializeToolCalls');
    expect(providers).not.toMatch(/runtime\.(initToolCall|confirmToolCall)/);
    expect(types).not.toMatch(/initialize\([^)]*transaction/);
    expect(fs.existsSync(path.join(src, 'agent/ai-employee/runtime.ts'))).toBe(
      false,
    );
    const messageStore = read(
      'agent/ai-employee/conversation-message-store.ts',
    );
    expect(messageStore).toContain('implements ConversationMessageStore');
    expect(
      fs.existsSync(path.join(src, 'agent/ai-employee/tool-call-handler.ts')),
    ).toBe(false);
    expect(messageStore).not.toContain('RepositoryFactory');
    expect(messageStore).not.toMatch(/\breject\s*\(/);
    expect(types).not.toMatch(/\breject\s*\(/);
    expect(messageStore).not.toContain('llmProviderManager');
    expect(messageStore).toContain('messages: AIMessageRepository');
    expect(messageStore).toContain('toolMessages: AIToolMessageRepository');
    expect(
      fs.existsSync(
        path.join(src, 'agent/ai-employee/tool-call-cancellation.ts'),
      ),
    ).toBe(false);
    expect(providers).not.toContain('DefaultToolCallHandler');
    expect(providers).toMatch(
      /createConversationProvider\(\s*options: AIEmployeeAgentOptions,?\s*\)/,
    );
    expect(providers).not.toContain('ToolCallPolicy');
    const options = read('agent/ai-employee/options.ts');
    expect(options).not.toContain('RepositoryFactory');
    expect(options).not.toMatch(/\brepositories\s*:/);
    expect(options).toContain('aiMessages: AIMessageRepository');
    expect(options).toContain('aiToolMessages: AIToolMessageRepository');
    expect(options).toContain('aiConversations: AIConversationRepository');
    expect(messageStore).toContain('class DefaultConversationMessageStore');
    expect(providers).toContain('new DefaultChatMessageConverters(options)');
    expect(read('agent/chat-message-converters.ts')).toContain(
      'export class DefaultChatMessageConverters',
    );
    expect(read('agent/chat-message-converters.ts')).not.toContain(
      'export class BaseChatMessageConverters',
    );
    expect(read('agent/chat-message-converters.ts')).toContain(
      'export class DefaultChatMessageConverters',
    );
    expect(
      fs.existsSync(path.join(src, 'agent/ai-employee/message-converters.ts')),
    ).toBe(false);
    expect(messageStore).not.toContain('private readonly options:');
    expect(providers).not.toMatch(/markPending:\s*\(|markDone:\s*\(/);
    expect(types).not.toMatch(/confirm\([^)]*DatabaseConnection/);
    const chatContext = read('agent/ai-employee/providers.ts');
    expect(chatContext).not.toContain('implements ToolCallPolicy');
    expect(chatContext).not.toContain('AIEmployeeToolContext');
    expect(chatContext).not.toContain('private readonly aiEmployeeOptions');
    expect(chatContext).not.toMatch(/this\.[A-Za-z]*repositories/i);
    expect(chatContext).toContain('private readonly conversations:');
    expect(chatContext).toContain('private readonly employees:');
    expect(chatContext).toContain('private readonly toolMessages:');
    expect(chatContext).toContain('private readonly usersAiEmployees:');
    expect(types).not.toContain('ToolCallPolicy');
    expect(types).not.toMatch(/getToolsMap|isAutoCall|shouldInterruptToolCall/);
    expect(
      fs.existsSync(path.join(src, 'agent/ai-employee/tool-call-policy.ts')),
    ).toBe(false);
    expect(
      fs.existsSync(path.join(src, 'agent/ai-employee/tool-context.ts')),
    ).toBe(false);
  });

  it('keeps split-table persistence behind the conversation message store', () => {
    const types = read('agent/types.ts');
    const middleware = read('agent/middleware/conversation.ts');

    expect(types).toMatch(
      /saveAssistantMessage\(\s*message: AIMessageInput,\s*toolMap: ReadonlyMap<string, ToolsEntity>,?\s*\)/,
    );
    expect(types).toMatch(
      /saveToolMessages\(\s*sourceMessageId: string,\s*messages: AIMessageInput\[\],?\s*\)/,
    );
    expect(types).toMatch(/loadMessages\(messageId\?: string\)/);
    expect(types).toMatch(/currentThread\(\)/);
    expect(types).not.toMatch(/forkThread\(/);
    const service = read('agent/agent-service.ts');
    const messageStore = read(
      'agent/ai-employee/conversation-message-store.ts',
    );
    expect(service).toMatch(/private async forkThread\(/);
    expect(service).toContain('const agent = createAgent({');
    expect(service).toContain('this.providers.checkpointer');
    expect(messageStore).not.toContain('createAgent');
    expect(messageStore).not.toContain('forkThread');
    expect(types).not.toMatch(/updateThread\(thread: AgentThread\)/);
    expect(read('agent/ai-employee/conversation-message-store.ts')).toContain(
      'target.updateThread(thread.thread)',
    );
    expect(
      read('agent/ai-employee/conversation-message-store.ts'),
    ).not.toContain('AIConversationRepository');
    expect(
      read('agent/ai-employee/conversation-message-store.ts'),
    ).not.toContain('updateThreadWithConnection');
    expect(types).not.toContain('ConversationThreadStore');
    expect(types).not.toMatch(/\bthreads:\s*ConversationThreadStore/);
    expect(types).not.toMatch(/\binitialize\(|\bconfirm\(/);
    expect(middleware).not.toContain('conversation.toolCalls.initialize');
    expect(middleware).not.toContain('conversation.toolCalls.confirm');
    expect(middleware).not.toContain('toolCallIds');
    expect(middleware).not.toContain('message.metadata.messageId');
    expect(middleware).toContain('saved.message.toolCalls ?? []');
    expect(middleware).toMatch(
      /saveToolMessages\(\s*currentMessageId,\s*toolMessages,?\s*\)/,
    );
  });
  it('owns the only standard middleware builder and preserves its order', () => {
    const service = read('agent/agent-service.ts');
    const pipeline = read('agent/middleware/pipeline.ts');
    const messageStore = read(
      'agent/ai-employee/conversation-message-store.ts',
    );
    expect(service).toContain('buildStandardAgentMiddleware');
    expect(messageStore).not.toContain('getMiddleware(');
    const positions = STANDARD_AGENT_MIDDLEWARE_ORDER.map((name) =>
      pipeline.indexOf(`'${name}'`),
    );
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual(
      [...positions].sort((left, right) => left - right),
    );
  });

  it('keeps disabled features as fixed no-op stages', () => {
    const pipeline = read('agent/middleware/pipeline.ts');
    for (const name of STANDARD_AGENT_MIDDLEWARE_ORDER)
      expect(pipeline).toContain(`namedNoopMiddleware('${name}')`);
  });

  it('removes data source context from the new AgentService path', () => {
    const agentSource = [
      'agent/agent-service.ts',
      'agent/ai-employee/options.ts',
      'agent/ai-employee/conversation-message-store.ts',
      'agent/ai-employee/providers.ts',
      'agent/types.ts',
    ]
      .map(read)
      .join('\n');
    expect(agentSource).not.toContain('getEmployeeDataSourceContext');
    expect(agentSource).not.toContain('dataSourceSettings');
    expect(agentSource).not.toContain('dataSourceManager');
    expect(agentSource).not.toContain('getCollection(');
  });
  it('keeps broad application Context out of AI tools and runtime tool context', () => {
    const aiToolSources = readAISources();
    expect(aiToolSources).not.toMatch(/import type \{\s*Context\s*\}/);
    expect(aiToolSources).not.toMatch(/defineTools<Context>/);
    expect(aiToolSources).not.toMatch(/ctx\.requestExecution/);
    expect(aiToolSources).not.toMatch(/ctx\.auth/);
    expect(aiToolSources).not.toMatch(/ctx\.aiConversationsManager/);
    expect(aiToolSources).not.toMatch(/ctx\.subAgentsDispatcher/);
    const service = read('agent/agent-service.ts');
    const providers = read('agent/ai-employee/providers.ts');
    expect(service).toContain('agentContext');
    expect(service).not.toContain('context.ctx');
    expect(providers).not.toContain('ctx: options.ctx');
  });

  it('keeps provider composition explicit', () => {
    const source = read('agent/providers.ts');

    const types = read('agent/types.ts');
    expect(source).not.toMatch(/\bMemory[A-Za-z]+/);
    expect(source).not.toContain('new LLMStreamCached(');
    expect(source).toContain('class DefaultAgentProviders');
    expect(source).not.toMatch(/export\s+class\s+Memory/);
    expect(source).not.toMatch(/:\s*ConversationProvider\s*=\s*\{/);
    expect(source).not.toMatch(/messages:\s*\{/);
    expect(source).not.toMatch(/toolCalls:\s*\{/);
    expect(source).not.toContain('ConversationThreadStore');
    expect(source).not.toContain('ConversationStreamStore');
    expect(source).not.toMatch(/conversation\.logger/);
    expect(types).toContain('streamCache: LLMStreamCached');
    expect(types).not.toContain('interface ConversationStreamStore');
    expect(
      types.match(/export interface ConversationProvider[\s\S]*?\n}\n/)?.[0],
    ).not.toContain('logger:');
    expect(types).toMatch(/interface AgentProviders[\s\S]*logger: Logger/);
    expect(source).not.toMatch(/streamCache:\s*\{/);
  });

  it('uses explicit provider instances and default features', async () => {
    class Context implements ChatContextProvider {
      readonly marker = 'base';
      currentConversation(): CurrentConversation {
        return { sessionId: 'contract' };
      }
      resolveLLM(): Promise<ResolvedAgentLLM> {
        return Promise.resolve({
          providerName: 'test',
          model: 'test',
          provider: llmProvider,
        });
      }
      async getSystemPrompt(): Promise<string> {
        return this.marker;
      }
      discoveredTools(): Promise<DiscoveredTools> {
        return Promise.resolve({
          tools: new Map(),
          activeTools: async () => new Set(),
        });
      }
    }
    const chatContext = new Context();
    const conversation = createTestConversationProvider({
      sessionId: 'direct',
    });
    const converters = new DefaultChatMessageConverters();
    const providers = createAgentProviders({
      conversation,
      chatContext,
      converters,
    });

    const llm = await providers.chatContext.resolveLLM({});
    expect(providers.conversation).toBe(conversation);
    expect(providers.chatContext).toBe(chatContext);
    expect(providers.converters).toBe(converters);
    expect(providers.features).toEqual(DEFAULT_AGENT_FEATURES);
    expect(await providers.chatContext.getSystemPrompt([])).toBe('base');
  });

  it('keeps test message and tool-call state behind the same contract', async () => {
    const conversation = createTestConversationProvider({
      sessionId: 'test',
    });
    const saved = await conversation.messages.saveAssistantMessage(
      {
        role: 'assistant',
        content: { type: 'text', content: 'answer' },
        toolCalls: [{ id: 'call-1', name: 'search', args: {} }],
      },
      new Map(),
    );

    expect(await conversation.messages.loadMessages()).toHaveLength(1);
    expect(await conversation.messages.currentThread()).toMatchObject({
      sessionId: 'test',
      thread: 0,
      threadId: 'test:0',
    });

    expect(saved.initializedToolCalls).toHaveLength(1);
    expect(
      await conversation.messages.getToolCallResult(
        String(saved.message.messageId),
        'call-1',
      ),
    ).toMatchObject({ invokeStatus: 'init' });

    await conversation.messages.saveToolMessages(
      String(saved.message.messageId),
      [
        {
          role: 'tool',
          content: { type: 'text', content: 'result' },
          metadata: { toolCallId: 'call-1' },
        },
      ],
    );

    expect(
      await conversation.messages.getToolCallResult(
        String(saved.message.messageId),
        'call-1',
      ),
    ).toMatchObject({ invokeStatus: 'confirmed' });
  });
  it('encodes typed events with the legacy SSE envelope', () => {
    const event: AgentStreamEvent = {
      type: 'content',
      conversation: { sessionId: 's1', username: 'dara', from: 'main-agent' },
      content: 'hello',
    };
    expect(toLegacyAgentEventPayload(event)).toEqual({
      sessionId: 's1',
      username: 'dara',
      from: 'main-agent',
      type: 'content',
      body: 'hello',
    });
    expect(encodeAgentEventSSE(event)).toBe(
      'data: {"sessionId":"s1","username":"dara","from":"main-agent","type":"content","body":"hello"}\n\n',
    );
  });

  it('serializes nested BigInt values as decimal strings in SSE payloads', () => {
    const event: AgentStreamEvent = {
      type: 'tool_call_status',
      conversation: { sessionId: 's1', username: 'dara', from: 'main-agent' },
      status: {
        toolCall: {
          id: 'call-1',
          name: 'query',
          messageId: 9007199254740993n as any,
        },
        invokeStatus: 'done',
        content: { id: 9007199254740995n },
      },
    };
    expect(encodeAgentEventSSE(event)).toContain(
      '"messageId":"9007199254740993"',
    );
    expect(encodeAgentEventSSE(event)).toContain('"id":"9007199254740995"');
  });

  it('marks standardized abort errors', () => {
    const error = new AgentServiceError('ABORTED', 'stopped');
    expect(error.aborted).toBe(true);
    expect(error.retryable).toBe(false);
  });
});

describe('AIEmployeesManager abort registry', () => {
  it('uses execution tokens so stale cleanup cannot remove a newer handle', () => {
    const manager = new AIEmployeesManager({} as any, {} as any);
    const oldAbort = vi.fn();
    const newAbort = vi.fn();
    const oldToken = Symbol('old');
    const newToken = Symbol('new');
    manager.registerAgentAbortHandle('s1', oldToken, { abort: oldAbort });
    manager.registerAgentAbortHandle('s1', newToken, { abort: newAbort });
    manager.unregisterAgentAbortHandle('s1', oldToken);
    expect(manager.onAbortConversation('s1')).toBe(true);
    expect(oldAbort).not.toHaveBeenCalled();
    expect(newAbort).toHaveBeenCalledOnce();
  });
});
