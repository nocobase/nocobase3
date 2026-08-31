import { describe, expect, it } from 'vitest';
import { DefaultAIEmployeeManager } from '../src/manager/ai-employee/default.js';
import { MemoryAIEmployeeRepository } from '../src/repository/memory/ai-employee.js';

function tool(name: string) {
  return { name };
}

describe('DefaultAIEmployeeManager', () => {
  it('merges loaded employees into a replacement repository before switching', async () => {
    const memory = new MemoryAIEmployeeRepository();
    const database = new MemoryAIEmployeeRepository();
    const manager = new DefaultAIEmployeeManager(memory);

    await manager.registerEmployee({
      username: 'nathan',
      nickname: 'Nathan from code',
      description: 'Developer assistant',
      systemPrompt: 'Packaged prompt',
      skills: ['frontend-development'],
      tools: [tool('read-code')],
      sort: 20,
    });
    await database.create({
      values: {
        username: 'nathan',
        nickname: 'Old nickname',
        about: 'User-maintained profile',
        defaultPrompt: 'Old prompt',
        skillSettings: {
          skills: ['old-skill'],
          tools: [tool('workflowCaller-report'), tool('removed-tool')],
        },
        enabled: false,
        builtIn: true,
        enableKnowledgeBase: true,
      },
    });

    await manager.switchRepository(database);

    await expect(manager.getEmployee('nathan')).resolves.toMatchObject({
      username: 'nathan',
      nickname: 'Nathan from code',
      description: 'Developer assistant',
      about: 'User-maintained profile',
      defaultPrompt: 'Packaged prompt',
      enabled: false,
      enableKnowledgeBase: true,
      skillSettings: {
        skills: ['frontend-development'],
        tools: [tool('workflowCaller-report'), tool('read-code')],
      },
      sort: 20,
    });

    await manager.registerEmployee({
      username: 'orin',
      nickname: 'Orin',
    });
    await expect(
      database.findOne({ filter: { username: 'orin' } }),
    ).resolves.toMatchObject({ username: 'orin', builtIn: true });
    await expect(
      memory.findOne({ filter: { username: 'orin' } }),
    ).resolves.toBeNull();
  });
});
