import { describe, expect, it } from 'vitest';
import { DefaultAIEmployeeManager } from '../src/manager/ai-employee/default.js';
import { MemoryAIEmployeeRepository } from '../src/repository/memory/ai-employee.js';

function tool(name: string) {
  return { name };
}

describe('DefaultAIEmployeeManager', () => {
  it('deduplicates upserts and preserves omitted overrides without changing legacy arrays', async () => {
    const manager = new DefaultAIEmployeeManager(
      new MemoryAIEmployeeRepository(),
    );
    await manager.upsertEmployee({
      username: 'atlas',
      skillSettings: {
        skills: ['legacy', 'legacy'],
        tools: [],
        enabledSkills: ['chosen', 'chosen'],
      },
    });
    await manager.upsertEmployee({
      username: 'atlas',
      skillSettings: { skills: ['updated', 'updated'], tools: [] },
    });
    expect((await manager.getEmployee('atlas'))?.skillSettings).toEqual({
      skills: ['updated', 'updated'],
      tools: [],
      enabledSkills: ['chosen'],
    });
    for (const enabledSkills of [[], null]) {
      const employee = await manager.upsertEmployee({
        username: 'atlas',
        skillSettings: { skills: [], tools: [], enabledSkills },
      });
      expect(employee.skillSettings.enabledSkills).toEqual(enabledSkills);
    }
    await expect(
      manager.upsertEmployee({
        username: 'atlas',
        skillSettings: { skills: [], tools: [], enabledSkills: [''] },
      }),
    ).rejects.toThrow('skillSettings.enabledSkills');
    expect(
      (await manager.getEmployee('atlas'))?.skillSettings.enabledSkills,
    ).toBeNull();
  });

  it.each(
    [[], ['chosen', 'chosen'], null].map((enabledSkills) => ({
      enabledSkills,
    })),
  )(
    'preserves explicit skill selection $enabledSkills through registration, promotion and restart',
    async ({ enabledSkills }) => {
      const memory = new MemoryAIEmployeeRepository();
      const manager = new DefaultAIEmployeeManager(memory);
      await manager.upsertEmployee({
        username: 'atlas',
        skillSettings: { skills: ['old'], tools: [], enabledSkills },
      });
      await manager.registerEmployee({ username: 'atlas', skills: ['new'] });
      const database = new MemoryAIEmployeeRepository();
      await manager.switchRepository(database);
      const expected =
        enabledSkills === null ? null : [...new Set(enabledSkills)];
      expect((await manager.getEmployee('atlas'))?.skillSettings).toEqual({
        skills: ['new'],
        tools: [],
        enabledSkills: expected,
      });
      const restarted = new DefaultAIEmployeeManager(
        new MemoryAIEmployeeRepository(),
      );
      await restarted.registerEmployee({
        username: 'atlas',
        skills: ['latest'],
      });
      await restarted.switchRepository(database);
      expect((await restarted.getEmployee('atlas'))?.skillSettings).toEqual({
        skills: ['latest'],
        tools: [],
        enabledSkills: expected,
      });
    },
  );

  it('keeps the destination override when switching repositories', async () => {
    const source = new MemoryAIEmployeeRepository();
    const destination = new MemoryAIEmployeeRepository();
    await source.create({
      values: {
        username: 'atlas',
        skillSettings: { skills: [], tools: [], enabledSkills: ['source'] },
      },
    });
    await destination.create({
      values: {
        username: 'atlas',
        skillSettings: { skills: [], tools: [], enabledSkills: null },
      },
    });
    const manager = new DefaultAIEmployeeManager(source);
    await manager.switchRepository(destination);
    expect(
      (await manager.getEmployee('atlas'))?.skillSettings.enabledSkills,
    ).toBeNull();
  });

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
