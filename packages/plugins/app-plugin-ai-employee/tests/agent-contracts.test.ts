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
import { BaseChatContextProvider } from '../server/agent/chat-context.js';
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
    const runtime = read('agent/ai-employee/runtime.ts');
    const providers = read('agent/ai-employee/providers.ts');
    expect(runtime).not.toContain('AIChatConversation');
    expect(runtime).not.toContain('createAIChatConversation');
    expect(runtime).not.toContain('aiChatConversation');
    expect(runtime).not.toContain('normalizeMessageAttachments');
    expect(runtime).not.toMatch(/async normalizeMessages\s*\(/);
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
  it('owns the only standard middleware builder and preserves its order', () => {
    const service = read('agent/agent-service.ts');
    const runtime = read('agent/ai-employee/runtime.ts');
    const pipeline = read('agent/middleware/pipeline.ts');
    expect(service).toContain('buildStandardAgentMiddleware');
    expect(runtime).not.toContain('getMiddleware(');
    expect(runtime).not.toContain('createAgent(');
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
      'agent/ai-employee/runtime.ts',
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

  it('merges partial conversation overrides without replacing defaults', async () => {
    const load = vi.fn(async () => []);
    const base = createMemoryConversationProvider({ sessionId: 'direct' });
    const providers = createAgentProviders({
      conversation: base,
      chatContext: new BaseChatContextProvider({
        llmResolver: {
          resolve: async () => ({
            provider: llmProvider,
            providerName: 'test',
            model: 'test',
          }),
        },
      }),
      overrides: { conversation: { messages: { load } } },
    });
    expect(providers.features).toEqual(DEFAULT_AGENT_FEATURES);
    expect(providers.conversation.messages.load).toBe(load);
    expect(typeof providers.conversation.messages.saveAssistantMessage).toBe(
      'function',
    );
    expect(typeof providers.conversation.toolCalls.markPending).toBe(
      'function',
    );
    await providers.conversation.messages.load();
    expect(load).toHaveBeenCalledOnce();
  });

  it('decorates class providers without losing prototype methods or receivers', async () => {
    class Context extends BaseChatContextProvider {
      readonly marker = 'base';
      override async getSystemPrompt(): Promise<string> {
        return this.marker;
      }
    }
    const base = new Context({
      llmResolver: {
        resolve: async () => ({
          provider: llmProvider,
          providerName: 'test',
          model: 'test',
        }),
      },
    });
    const converters = new BaseChatMessageConverters();
    const providers = createAgentProviders({
      chatContext: base,
      chatMessageConverters: converters,
      overrides: {
        chatContext: (target) =>
          new Proxy(target, {
            get(object, property, receiver) {
              if (property === 'shouldInterruptToolCall') return () => true;
              return Reflect.get(object, property, receiver);
            },
          }),
      },
    });

    const llm = await providers.chatContext.resolveLLM({});
    expect(await providers.chatContext.getSystemPrompt([], {}, llm)).toBe(
      'base',
    );
    expect(providers.chatContext.shouldInterruptToolCall()).toBe(true);
    expect(providers.chatMessageConverters).toBe(converters);
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
