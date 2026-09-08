import { describe, expect, it, vi } from 'vitest';
import { skillToolBindingMiddleware } from '../server/agent/middleware/skill-tools.js';

function hook<T extends (...args: any[]) => any>(
  value: unknown,
  name: string,
): T {
  const target = (value as Record<string, any>)[name];
  return (typeof target === 'function' ? target : target.hook) as T;
}

describe('SkillToolBindingMiddleware', () => {
  it('re-queries active tools for model and tool calls', async () => {
    const activeTools = vi
      .fn()
      .mockResolvedValueOnce(new Set(['getSkill']))
      .mockResolvedValueOnce(new Set(['getSkill', 'skillTool']))
      .mockResolvedValueOnce(new Set(['getSkill']));
    const middleware = skillToolBindingMiddleware(
      { activeTools },
      { request: {}, initialActiveToolNames: ['getSkill'] },
    ) as any;
    const wrapModelCall = hook<any>(middleware, 'wrapModelCall');
    const wrapToolCall = hook<any>(middleware, 'wrapToolCall');
    const modelHandler = vi.fn(async (request) => request.tools);
    const tools = [{ name: 'getSkill' }, { name: 'skillTool' }];

    expect(await wrapModelCall({ tools }, modelHandler)).toEqual([
      { name: 'getSkill' },
    ]);
    expect(await wrapModelCall({ tools }, modelHandler)).toEqual(tools);

    const unavailable = await wrapToolCall(
      { toolCall: { id: 'call-1', name: 'skillTool' } },
      vi.fn(),
    );
    expect(unavailable.status).toBe('error');
    expect(unavailable.content).toBe('Tool unavailable.');
    expect(activeTools).toHaveBeenCalledTimes(3);
  });
});
