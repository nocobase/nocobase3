import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

import { BuiltInManager } from '../server/manager/built-in-manager.js';
import { createWorkContextHandler } from '../server/manager/work-context/index.js';

describe('explicit internal helper contracts', () => {
  it('localizes built-in employees through the injected translator and namespace', () => {
    const translate = vi.fn(
      (key: string, options?: Record<string, unknown>) =>
        `${String(options?.ns)}:${key}`,
    );
    const employee = {
      builtIn: true,
      nickname: 'nickname',
      position: 'position',
      bio: 'bio',
      greeting: 'greeting',
    };

    new BuiltInManager('@nocobase/app-plugin-ai-employee').setupBuiltInInfo({
      employee,
      translate,
    });

    expect(employee).toMatchObject({
      nickname: '@nocobase/app-plugin-ai-employee:nickname',
      position: '@nocobase/app-plugin-ai-employee:position',
      bio: '@nocobase/app-plugin-ai-employee:bio',
      greeting: '@nocobase/app-plugin-ai-employee:greeting',
    });
    expect(translate).toHaveBeenCalledWith('nickname', {
      ns: '@nocobase/app-plugin-ai-employee',
    });
  });

  it('resolves work context with the fallback behavior and no strategy registry', async () => {
    const handler = createWorkContextHandler();

    await expect(
      handler.resolve([
        { type: 'text', content: 'plain' },
        { type: 'record', content: { id: 1 } },
        { type: 'empty', content: null },
      ]),
    ).resolves.toEqual(['plain', '{"id":1}']);
    await expect(handler.background([])).resolves.toEqual([]);
    expect(handler).not.toHaveProperty('registerStrategy');
  });

  it('keeps conversation service operation inputs explicit', () => {
    const source = readFileSync(
      new URL('../server/service/ai-conversation-service.ts', import.meta.url),
      'utf8',
    );

    expect(source).not.toMatch(/ctx: Context|\{ ctx/);
    expect(source).not.toContain('ctx.requestExecution');
    expect(source).not.toContain('ctx.throw');
    expect(source).not.toContain('setupSSEHeaders');
  });
});
