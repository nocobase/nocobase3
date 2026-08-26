import { describe, expect, it, vi } from 'vitest';

import { skillToolBindingMiddleware } from '../../server/ai-employees/middleware/skill-tools.js';

describe('skillToolBindingMiddleware', () => {
  it('keeps only base and activated-skill tools in model requests', async () => {
    const middleware = skillToolBindingMiddleware(
      {
        getActivatedSkillToolNames: vi
          .fn()
          .mockResolvedValue(
            new Set(['getSkill', 'dataQuery', 'getCollectionNames']),
          ),
      } as any,
      { baseToolNames: ['getSkill'] },
    );
    const handler = vi.fn(async (request) => request);

    const result = await middleware.wrapModelCall!(
      {
        tools: [
          { name: 'getSkill' },
          { name: 'dataQuery' },
          { name: 'getCollectionNames' },
          { name: 'hiddenTool' },
        ],
      } as any,
      handler as any,
    );

    expect(handler).toHaveBeenCalledOnce();
    expect((result as any).tools.map((tool: any) => tool.name)).toEqual([
      'getSkill',
      'dataQuery',
      'getCollectionNames',
    ]);
  });

  it('preserves provider built-in tools that have no name', async () => {
    const middleware = skillToolBindingMiddleware(
      {
        getActivatedSkillToolNames: vi
          .fn()
          .mockResolvedValue(new Set(['getSkill'])),
      } as any,
      { baseToolNames: ['getSkill'] },
    );
    const handler = vi.fn(async (request) => request);
    const webSearchTool = { type: 'web_search_preview' };
    const googleSearchTool = { googleSearch: {} };

    const result = await middleware.wrapModelCall!(
      {
        tools: [
          { name: 'getSkill' },
          webSearchTool,
          googleSearchTool,
          { name: 'hiddenTool' },
        ],
      } as any,
      handler as any,
    );

    expect((result as any).tools).toEqual([
      { name: 'getSkill' },
      webSearchTool,
      googleSearchTool,
    ]);
  });
});
