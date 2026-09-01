import { describe, expect, it, vi } from 'vitest';

import type { Context } from '../../server/context.js';
import { AISkillService } from '../../server/service/ai-skill-service.js';
import { AIToolService } from '../../server/service/ai-tool-service.js';

function createContext(): Context {
  return {
    ai: {
      skillsManager: {
        listSkills: vi.fn(async () => [
          {
            name: 'analysis',
            description: 'Analyze records',
            content: 'private skill instructions',
          },
        ]),
        getSkills: vi.fn(async () => ({ name: 'analysis' })),
      },
      toolsManager: {
        listTools: vi.fn(async () => [
          {
            definition: {
              name: 'search',
              description: 'Search records',
              schema: { type: 'object' },
            },
            defaultPermission: 'ASK',
            invoke: vi.fn(),
          },
        ]),
        getTools: vi.fn(async () => ({
          definition: { name: 'search' },
          invoke: vi.fn(),
        })),
      },
    },
  } as unknown as Context;
}

describe('AI employee read-only metadata lists', () => {
  it('allows authenticated members to read sanitized skill and tool metadata', async () => {
    const serviceContext = createContext();
    const skills = new AISkillService();
    const tools = new AIToolService();

    await expect(skills.list(serviceContext)).resolves.toEqual([
      { name: 'analysis', description: 'Analyze records' },
    ]);
    await expect(tools.list(serviceContext)).resolves.toEqual([
      expect.objectContaining({
        definition: expect.objectContaining({ name: 'search' }),
        defaultPermission: 'ASK',
      }),
    ]);
    const serializedTools = await tools.list(serviceContext);
    expect(serializedTools[0]).not.toHaveProperty('invoke');
  });

  it('allows members to read managed metadata without an additional service-level policy', async () => {
    const serviceContext = createContext();

    await expect(
      new AISkillService().get(serviceContext, 'analysis'),
    ).resolves.toEqual({ name: 'analysis' });
    await expect(
      new AIToolService().get(serviceContext, 'search'),
    ).resolves.toEqual(
      expect.objectContaining({
        definition: { name: 'search' },
      }),
    );
  });
});
