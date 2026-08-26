import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  AgentServiceError,
  DEFAULT_AGENT_FEATURES,
  STANDARD_AGENT_MIDDLEWARE_ORDER,
  type AgentStreamEvent,
} from '../server/agent/types.js';
import { AIEmployeesManager } from '../server/ai-employees/ai-employees-manager.js';
import {
  createAgentProviders,
  createMemoryConversationProvider,
} from '../server/agent/providers.js';
import {
  encodeAgentEventSSE,
  toLegacyAgentEventPayload,
} from '../server/agent/sse.js';

const src = path.resolve(import.meta.dirname, '../server');
const read = (relative: string) =>
  fs.readFileSync(path.join(src, relative), 'utf8');

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

  it('merges partial conversation overrides without replacing defaults', async () => {
    const load = vi.fn(async () => []);
    const base = createMemoryConversationProvider({ sessionId: 'direct' });
    const providers = createAgentProviders({
      llmProvider,
      llmIdentity: { providerName: 'test', model: 'test' },
      conversation: base,
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
