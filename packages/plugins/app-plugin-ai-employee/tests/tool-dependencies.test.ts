import { describe, expect, it, vi } from 'vitest';
import { createServiceToken } from '@nocobase/service-provider';
import { buildTool } from '@nocobase/ai-employee';
import { AgentService } from '../server/agent/service/agent-service.js';
import { createTestConversationProvider } from './test-conversation-provider.js';
import { DEFAULT_AGENT_FEATURES } from '../server/agent/types.js';

const billingToken = createServiceToken<{ name: string }>('test/billing');
const auditToken = createServiceToken<{ name: string }>('test/audit');
const unboundToken = createServiceToken<{ name: string }>('test/unbound');

const billing = { name: 'billing' };
const audit = { name: 'audit' };

const container = {
  has: (token: unknown) => token === billingToken || token === auditToken,
  resolve: (token: unknown) => {
    if (token === billingToken) return billing;
    if (token === auditToken) return audit;
    throw new Error('Service is not registered');
  },
} as never;

const baseContext = { actor: { id: 1, roles: [], isRoot: false }, state: {} };

function createService(tools: unknown[], withContainer = true) {
  const seen: Record<string, unknown> = {};
  const providers = {
    conversation: createTestConversationProvider({ sessionId: 'deps' }),
    logger: { warn: vi.fn(), error: vi.fn() },
    ...(withContainer ? { container } : {}),
    context: {
      toolRuntimeContext: () => baseContext,
      currentConversation: () => ({ sessionId: 'deps' }),
      resolveLLM: async () => ({
        providerName: 'test',
        model: 'test',
        provider: {
          createModel: () => ({}),
          resolveTools: (built: unknown) => built,
          parseResponseError: (error: unknown) => String(error),
        },
      }),
      getSystemPrompt: async () => undefined,
      discoveredTools: async () => ({
        tools: new Map(
          (tools as { definition: { name: string } }[]).map((tool) => [
            tool.definition.name,
            tool,
          ]),
        ),
        activeTools: async () => new Set<string>(),
      }),
    },
    converters: {
      formatMessages: async (messages: unknown) => messages,
      assistant: { convert: vi.fn() },
      human: { convert: vi.fn() },
      tool: { convert: vi.fn() },
    },
    features: { ...DEFAULT_AGENT_FEATURES },
  } as never;
  return { service: new AgentService(providers), seen };
}

const recordInto = (seen: Record<string, unknown>, key: string) => ({
  scope: 'GENERAL' as const,
  definition: { name: key, description: key },
  invoke: async (ctx: unknown) => {
    seen[key] = ctx;
    return 'ok';
  },
});

const userMessages = [
  { role: 'user' as const, content: { type: 'text' as const, content: 'hi' } },
];

/** Runs every tool the agent was built with, the way the graph would. */
async function runTools(builtTools: unknown[]): Promise<void> {
  for (const [index, built] of builtTools.entries()) {
    await (
      built as {
        invoke: (input: unknown, config: unknown) => Promise<unknown>;
      }
    ).invoke({}, { context: {}, toolCall: { id: `call-${index}` } });
  }
}

describe('tool dependencies', () => {
  it('hands a tool the services it declared, and only those', async () => {
    const seen: Record<string, unknown> = {};
    const declaring = {
      ...recordInto(seen, 'declaring'),
      dependencies: { billing: billingToken },
    };
    const plain = recordInto(seen, 'plain');
    const { service } = createService([declaring, plain]);
    const built: unknown[] = [];
    vi.spyOn(service as never, 'create').mockImplementation(((prepared: {
      tools: unknown[];
    }) => {
      built.push(...prepared.tools);
      return { invoke: async () => ({ messages: [] }) };
    }) as never);

    await service.invoke({ userMessages });
    await runTools(built);

    expect((seen.declaring as { deps: unknown }).deps).toEqual({ billing });
    // A tool that declared nothing reaches nothing, including what the tool
    // beside it declared.
    expect((seen.plain as { deps: unknown }).deps).toEqual({});
  });

  it('gives each tool its own context so one cannot read another', async () => {
    const seen: Record<string, unknown> = {};
    const first = {
      ...recordInto(seen, 'first'),
      dependencies: { billing: billingToken },
    };
    const second = {
      ...recordInto(seen, 'second'),
      dependencies: { audit: auditToken },
    };
    const { service } = createService([first, second]);
    const built: unknown[] = [];
    vi.spyOn(service as never, 'create').mockImplementation(((prepared: {
      tools: unknown[];
    }) => {
      built.push(...prepared.tools);
      return { invoke: async () => ({ messages: [] }) };
    }) as never);

    await service.invoke({ userMessages });
    await runTools(built);

    expect(seen.first).not.toBe(seen.second);
    expect((seen.first as { deps: unknown }).deps).toEqual({ billing });
    expect((seen.second as { deps: unknown }).deps).toEqual({ audit });
  });

  it('reports a declared token the container cannot resolve, naming the tool', async () => {
    const seen: Record<string, unknown> = {};
    const broken = {
      ...recordInto(seen, 'broken'),
      dependencies: { missing: unboundToken },
    };
    const { service } = createService([broken]);

    await expect(service.invoke({ userMessages })).rejects.toThrow(
      /Tool "broken" declares dependency "missing" \("test\/unbound"\)/,
    );
  });

  it('reports a declaration this agent has no container for', async () => {
    const seen: Record<string, unknown> = {};
    const declaring = {
      ...recordInto(seen, 'declaring'),
      dependencies: { billing: billingToken },
    };
    const { service } = createService([declaring], false);

    await expect(service.invoke({ userMessages })).rejects.toThrow(
      /Tool "declaring" declares dependency "billing" but this agent has no container/,
    );
  });

  it('runs a tool built with no context only when it asked for none', async () => {
    const seen: Record<string, unknown> = {};
    const free = { ...recordInto(seen, 'free'), requiresContext: false };
    const needsContext = recordInto(seen, 'needs');
    const builtFree = buildTool(free) as unknown as {
      invoke: (input: unknown, config: unknown) => Promise<unknown>;
    };
    const builtNeeds = buildTool(needsContext) as unknown as {
      invoke: (input: unknown, config: unknown) => Promise<unknown>;
    };

    await builtFree.invoke({}, { context: {}, toolCall: { id: 'free' } });
    expect(seen.free).toBeUndefined();
    await expect(
      builtNeeds.invoke({}, { context: {}, toolCall: { id: 'needs' } }),
    ).rejects.toThrow('Agent context is required to execute tool "needs"');
  });
});
