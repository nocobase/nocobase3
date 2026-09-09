import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  AgentServiceError,
  DEFAULT_AGENT_FEATURES,
  STANDARD_AGENT_MIDDLEWARE_ORDER,
  type AgentStreamEvent,
} from '../server/agent/types.js';
import { AIEmployeesManager } from '../server/manager/ai-employees-manager.js';
import {
  createAgentProviders,
  createMemoryConversationProvider,
} from '../server/agent/providers.js';
import { FixedChatContextProvider } from '../server/agent/chat-context.js';
import { BaseChatMessageConverters } from '../server/agent/chat-message-converters.js';
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
    expect(read('agent/agent-service.ts')).toContain(
      '...(request.context ?? {})',
    );
  });

  it('keeps AI chat conversation ownership in the conversation provider', () => {
    const providers = read('agent/ai-employee/providers.ts');
    expect(fs.existsSync(path.join(src, 'agent/ai-employee/runtime.ts'))).toBe(
      false,
    );
    expect(providers).toContain(
      'const chatConversation = createAIChatConversation({',
    );
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
    expect(service).toContain(
      'this.providers.chatMessageConverters.formatMessages(',
    );
    expect(pipeline).not.toContain('MessageNormalizationMiddleware');
  });

  it('forbids legacy provider bridges and runtime-owned context responsibilities', () => {
    const production = [
      'agent/types.ts',
      'agent/providers.ts',
      'agent/direct.ts',
      'agent/agent-service.ts',
      'agent/ai-employee/providers.ts',
      'agent/ai-employee/tool-call-handler.ts',
      'agent/middleware/pipeline.ts',
    ]
      .map(read)
      .join('\n');
    const toolCallHandler = read('agent/ai-employee/tool-call-handler.ts');
    expect(production).not.toMatch(/\bToolProvider\b/);
    expect(production).not.toContain('createDefaultToolProvider');
    expect(production).not.toContain('createAIEmployeeToolProvider');
    expect(production).not.toContain('providers.llmProvider');
    expect(production).not.toContain('providers.llmIdentity');
    expect(production).not.toContain('providers.tools');
    expect(production).not.toContain('DirectChatContextProvider');
    expect(toolCallHandler).not.toMatch(
      /getSystemPrompt|getAgentTools|getAvailableSkills/,
    );
    expect(toolCallHandler).not.toMatch(/getActivatedSkillToolNames/);
    expect(toolCallHandler).not.toMatch(
      /public\s+(?:async\s+)?(?:getToolsMap|shouldInterruptToolCall|isAutoCall)\s*\(/,
    );
    expect(read('agent/ai-employee/providers.ts')).not.toMatch(
      /activeProvider|activeIdentity/,
    );
    expect(production).not.toMatch(
      /Object\.assign\([^)]*(chatContext|converter)/,
    );
    expect(production).not.toMatch(/\.\.\.(options\.)?chatContext/);
    expect(read('agent/ai-employee/message-converters.ts')).toContain(
      "from './options.js'",
    );
    const skillMiddleware = read('agent/middleware/skill-tools.ts');
    expect(skillMiddleware).toContain('activeTools(options.request)');
    expect(skillMiddleware).toContain('wrapModelCall');
    expect(skillMiddleware).toContain('wrapToolCall');
  });

  it('keeps tool-call cancellation behind the unified AgentService contract', () => {
    const service = read('agent/agent-service.ts');
    const providers = read('agent/ai-employee/providers.ts');
    const factory = read('agent/ai-employee/index.ts');
    const types = read('agent/types.ts');

    expect(service).toContain('this.providers.conversation.toolCalls.cancel()');
    expect(providers).not.toContain(['AIEmployeeAgent', 'Facade'].join(''));
    expect(providers).not.toContain('AIEmployeeAgentProvidersResult');
    expect(providers).not.toContain(['getToolCall', 'Handler'].join(''));
    expect(providers).not.toMatch(/return\s*\{\s*providers,?\s*facade/s);
    expect(factory).not.toContain('interface AIEmployeeAgentService');
    expect(factory).not.toContain('facade');
    expect(factory).toContain('Promise<AgentService>');
    expect(types).not.toContain('ToolCallHandler');
    expect(providers).not.toContain('async function initializeToolCalls');
    expect(providers).not.toMatch(/runtime\.(initToolCall|confirmToolCall)/);
    expect(types).not.toMatch(/initialize\([^)]*transaction/);
    expect(fs.existsSync(path.join(src, 'agent/ai-employee/runtime.ts'))).toBe(
      false,
    );
    const handler = read('agent/ai-employee/tool-call-handler.ts');
    expect(handler).toContain('implements ConversationToolCallStore');
    expect(handler).not.toContain('RepositoryFactory');
    expect(handler).not.toMatch(/\binitialize(?:InTransaction)?\s*\(/);
    expect(handler).not.toMatch(/\bconfirm(?:InTransaction)?\s*\(/);
    expect(handler).not.toMatch(/\breject\s*\(/);
    expect(types).not.toMatch(/\breject\s*\(/);
    expect(handler).not.toContain('ToolCallPolicy');
    expect(handler).not.toContain('llmProviderManager');
    expect(handler).toContain('messages: AIMessageRepository');
    expect(handler).toContain('toolMessages: AIToolMessageRepository');
    expect(
      fs.existsSync(
        path.join(src, 'agent/ai-employee/tool-call-cancellation.ts'),
      ),
    ).toBe(false);
    expect(providers).toContain('toolCalls: AIEmployeeToolCallHandler');
    expect(providers).toContain('toolCalls,');
    expect(providers).not.toMatch(/markPending:\s*\(|markDone:\s*\(/);
    expect(types).not.toMatch(/confirm\([^)]*DatabaseConnection/);
    const chatContext = read('agent/ai-employee/providers.ts');
    expect(chatContext).not.toContain('implements ToolCallPolicy');
    expect(chatContext).not.toContain('AIEmployeeToolContext');
    expect(types).toContain('export type ToolCallPolicy = Pick<');
    expect(types).toContain(
      "'getToolsMap' | 'isAutoCall' | 'shouldInterruptToolCall'",
    );
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
      /saveAssistantMessage\(\s*message: AIMessageInput,?\s*\)/,
    );
    expect(types).toMatch(
      /saveToolMessages\(\s*sourceMessageId: string,\s*messages: AIMessageInput\[\],?\s*\)/,
    );
    expect(types).toMatch(/loadMessages\(messageId\?: string\)/);
    expect(types).toMatch(/currentThread\(\)/);
    expect(types).toMatch(/forkThread\(provider: LLMProvider\)/);
    expect(types).toMatch(/updateThread\(thread: AgentThread\)/);
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
    const handler = read('agent/ai-employee/tool-call-handler.ts');
    expect(service).toContain('buildStandardAgentMiddleware');
    expect(handler).not.toContain('getMiddleware(');
    expect(handler).not.toContain('createAgent(');
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
      'agent/ai-employee/tool-call-handler.ts',
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

  it('implements memory providers as private classes instead of inline objects', () => {
    const source = read('agent/providers.ts');

    expect(source).toContain('class MemoryConversationProvider');
    expect(source).toContain('class MemoryConversationMessageStore');
    expect(source).toContain('class MemoryConversationToolCallStore');
    expect(source).toContain('class MemoryConversationStreamStore');
    expect(source).toContain('class DefaultAgentProviders');
    expect(source).not.toMatch(/export\s+class\s+(?:Memory|DefaultAgent)/);
    expect(source).not.toMatch(/:\s*ConversationProvider\s*=\s*\{/);
    expect(source).not.toMatch(/messages:\s*\{/);
    expect(source).not.toMatch(/toolCalls:\s*\{/);
    expect(source).not.toContain('ConversationThreadStore');
    expect(source).not.toMatch(/streamCache:\s*\{/);
  });

  it('uses explicit provider instances and default features', async () => {
    class Context extends FixedChatContextProvider {
      readonly marker = 'base';
      override async getSystemPrompt(): Promise<string> {
        return this.marker;
      }
    }
    const chatContext = new Context({
      provider: llmProvider,
      providerName: 'test',
      model: 'test',
    });
    const conversation = createMemoryConversationProvider({
      sessionId: 'direct',
    });
    const chatMessageConverters = new BaseChatMessageConverters();
    const providers = createAgentProviders({
      conversation,
      chatContext,
      chatMessageConverters,
    });

    const llm = await providers.chatContext.resolveLLM({});
    expect(providers.conversation).toBe(conversation);
    expect(providers.chatContext).toBe(chatContext);
    expect(providers.chatMessageConverters).toBe(chatMessageConverters);
    expect(providers.features).toEqual(DEFAULT_AGENT_FEATURES);
    expect(await providers.chatContext.getSystemPrompt([], {}, llm)).toBe(
      'base',
    );
  });

  it('keeps memory message and tool-call state behind the same contract', async () => {
    const conversation = createMemoryConversationProvider({
      sessionId: 'memory',
    });
    const saved = await conversation.messages.saveAssistantMessage({
      role: 'assistant',
      content: { type: 'text', content: 'answer' },
      toolCalls: [{ id: 'call-1', name: 'search', args: {} }],
    });

    expect(await conversation.messages.loadMessages()).toHaveLength(1);
    expect(await conversation.messages.currentThread()).toMatchObject({
      sessionId: 'memory',
      thread: 0,
      threadId: 'memory:0',
    });
    expect(await conversation.messages.forkThread({} as never)).toMatchObject({
      sessionId: 'memory',
      thread: 1,
      threadId: 'memory:1',
    });
    await conversation.messages.updateThread({
      sessionId: 'memory',
      thread: 3,
      threadId: 'memory:3',
    });
    expect(await conversation.messages.currentThread()).toMatchObject({
      thread: 3,
      threadId: 'memory:3',
    });

    expect(saved.initializedToolCalls).toHaveLength(1);
    expect(
      await conversation.toolCalls.get(
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
      await conversation.toolCalls.get(
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
