import { describe, expect, it, vi } from 'vitest';
import type { RuntimeActor } from '@nocobase/ai-employee';

import { AIEmployeeAccessPolicy } from '../../server/auth/access-policy.js';
import type { Context } from '../../server/context.js';
import { AISkillService } from '../../server/service/ai-skill-service.js';
import { AIToolService } from '../../server/service/ai-tool-service.js';

const member: RuntimeActor = { id: '1', roles: ['member'] };

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
    const policy = new AIEmployeeAccessPolicy();
    const skills = new AISkillService(policy);
    const tools = new AIToolService(policy);

    await expect(skills.list(serviceContext, member)).resolves.toEqual([
      { name: 'analysis', description: 'Analyze records' },
    ]);
    await expect(tools.list(serviceContext, member)).resolves.toEqual([
      expect.objectContaining({
        definition: expect.objectContaining({ name: 'search' }),
        defaultPermission: 'ASK',
      }),
    ]);
    const serializedTools = await tools.list(serviceContext, member);
    expect(serializedTools[0]).not.toHaveProperty('invoke');
  });

  it('allows members to read managed metadata while permissions are not integrated', async () => {
    const serviceContext = createContext();
    const policy = new AIEmployeeAccessPolicy();

    await expect(
      new AISkillService(policy).get(serviceContext, member, 'analysis'),
    ).resolves.toEqual({ name: 'analysis' });
    await expect(
      new AIToolService(policy).get(serviceContext, member, 'search'),
    ).resolves.toEqual(
      expect.objectContaining({
        definition: { name: 'search' },
      }),
    );
  });
});
