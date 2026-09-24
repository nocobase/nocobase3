import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ServiceContainer,
  createServiceToken,
} from '@nocobase/service-provider';
import { LLMProvider, defineTools } from '../index.js';

type BoundTool = {
  name: string;
  invoke(call: unknown): Promise<unknown>;
};

class TestProvider extends LLMProvider {
  public readonly bound: unknown[][] = [];

  public createModel() {
    return {
      bindTools: (tools: unknown[]) => {
        this.bound.push(tools);
        return { tools };
      },
    };
  }

  protected builtInTools(): unknown[] {
    return this.modelOptions?.builtIn?.webSearch === true
      ? [{ type: 'web_search' }]
      : [];
  }

  public isToolConflict(): boolean {
    return this.modelOptions?.conflict === true;
  }
}

function providerWith(modelOptions: Record<string, unknown> = {}) {
  return new TestProvider({ modelOptions: { model: 'm', ...modelOptions } });
}

const greetingToken = createServiceToken<{ greet(name: string): string }>(
  'test/greeting',
);

const invoked: unknown[] = [];
const greet = defineTools({
  scope: 'CUSTOM',
  definition: {
    name: 'greet',
    description: 'Greets someone',
    schema: {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
    },
  },
  dependencies: { greeting: greetingToken },
  invoke: async (ctx, args: { name: string }) => {
    invoked.push(ctx);
    return {
      status: 'success',
      content: ctx.deps.greeting.greet(args.name),
    };
  },
});

function call(tool: BoundTool) {
  return tool.invoke({
    id: 'call-1',
    name: tool.name,
    args: { name: 'Ada' },
    type: 'tool_call',
  });
}

afterEach(() => {
  invoked.length = 0;
  vi.restoreAllMocks();
});

describe('LLMProvider tools', () => {
  it('builds tools with their context and declared dependencies, as an agent does', async () => {
    const container = new ServiceContainer();
    container.instance(greetingToken, { greet: (name) => `Hello, ${name}` });
    const provider = providerWith();

    provider.prepareChain({
      tools: [greet],
      toolContext: { agentContext: { actor: { id: 7 } }, container },
    });

    const [tool] = provider.bound[0] as BoundTool[];
    await call(tool!);
    expect(invoked).toEqual([
      expect.objectContaining({
        actor: { id: 7 },
        deps: { greeting: expect.anything() },
      }),
    ]);
  });

  it('builds tools with no context when none is given, so a tool that needs one fails when called', async () => {
    const provider = providerWith();

    provider.prepareChain({ tools: [greet] });

    const [tool] = provider.bound[0] as BoundTool[];
    await expect(call(tool!)).rejects.toThrow(
      'Agent context is required to execute tool "greet"',
    );
    expect(invoked).toEqual([]);
  });

  it('reports a declared dependency the container cannot resolve, naming the tool', () => {
    expect(() =>
      providerWith().prepareChain({
        tools: [greet],
        toolContext: { agentContext: {}, container: new ServiceContainer() },
      }),
    ).toThrow(
      'Tool "greet" declares dependency "greeting" ("test/greeting") which the application container cannot resolve',
    );
  });

  it('binds only the built-in search when it is on and no tools are given', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const provider = providerWith({ builtIn: { webSearch: true } });

    provider.prepareChain({});

    expect(provider.bound).toEqual([[{ type: 'web_search' }]]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns when tools come with built-in search on a provider that cannot combine them, and binds as before', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const provider = providerWith({
      builtIn: { webSearch: true },
      conflict: true,
    });

    provider.prepareChain({ tools: [greet] });

    expect(provider.bound).toEqual([[{ type: 'web_search' }]]);
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0]?.[0])).toContain('(greet)');
    expect(String(warn.mock.calls[0]?.[0])).toContain('not bound');
  });

  it('warns when tools come with built-in search on a provider that combines them, and binds as before', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const provider = providerWith({ builtIn: { webSearch: true } });

    provider.prepareChain({ tools: [greet] });

    const [bound] = provider.bound as unknown[][];
    expect(bound?.[0]).toEqual({ type: 'web_search' });
    expect((bound?.[1] as BoundTool | undefined)?.name).toBe('greet');
    expect(bound).toHaveLength(2);
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0]?.[0])).toContain('bound together');
  });
});
