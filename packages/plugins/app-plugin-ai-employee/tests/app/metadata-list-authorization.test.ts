import { describe, expect, it, vi } from 'vitest';

import { AISkillService } from '../../server/service/ai-skill-service.js';
import { AIToolService } from '../../server/service/ai-tool-service.js';

function createAI() {
  return {
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
  };
}

describe('AI employee read-only metadata lists', () => {
  it('allows authenticated members to read sanitized skill and tool metadata', async () => {
    const ai = createAI();
    const skills = new AISkillService({ ai: ai as never });
    const tools = new AIToolService({ ai: ai as never });

    await expect(skills.list({})).resolves.toEqual([
      { name: 'analysis', description: 'Analyze records' },
    ]);
    await expect(tools.list({})).resolves.toEqual([
      expect.objectContaining({
        definition: expect.objectContaining({ name: 'search' }),
        defaultPermission: 'ASK',
      }),
    ]);
    const serializedTools = await tools.list({});
    expect(serializedTools[0]).not.toHaveProperty('invoke');
  });

  it('allows members to read managed metadata without an additional service-level policy', async () => {
    const ai = createAI();

    await expect(
      new AISkillService({ ai: ai as never }).get({ name: 'analysis' }),
    ).resolves.toEqual({ name: 'analysis' });
    await expect(
      new AIToolService({ ai: ai as never }).get({ name: 'search' }),
    ).resolves.toEqual(
      expect.objectContaining({
        definition: { name: 'search' },
      }),
    );
  });
});
