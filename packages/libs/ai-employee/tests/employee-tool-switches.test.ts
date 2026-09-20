import { describe, expect, it } from 'vitest';
import { DefaultAIEmployeeManager } from '../src/manager/ai-employee/default.js';
import { MemoryAIEmployeeRepository } from '../src/repository/memory/ai-employee.js';

const savedTools = [
  { name: 'custom-ask', autoCall: false },
  { name: 'custom-allow', autoCall: true },
  { name: 'unknown-saved-name', autoCall: false },
];

describe('employee tool selections', () => {
  it('deduplicates selection, preserves omitted selection, and resets to legacy with null', async () => {
    const manager = new DefaultAIEmployeeManager(
      new MemoryAIEmployeeRepository(),
    );
    await manager.registerEmployee({ username: 'atlas' });
    expect(
      (await manager.getEmployee('atlas'))?.skillSettings,
    ).not.toHaveProperty('enabledTools');
    await manager.upsertEmployee({
      username: 'atlas',
      skillSettings: {
        skills: [],
        tools: savedTools,
        enabledTools: ['unknown', 'unknown'],
      },
    });
    const updated = await manager.upsertEmployee({
      username: 'atlas',
      skillSettings: { skills: ['new'], tools: savedTools },
    });
    expect(updated.skillSettings.enabledTools).toEqual(['unknown']);
    for (const enabledTools of [[], null]) {
      const saved = await manager.upsertEmployee({
        ...updated,
        skillSettings: { ...updated.skillSettings, enabledTools },
      });
      expect(saved.skillSettings.enabledTools).toEqual(enabledTools);
    }
  });

  it.each(['bad', 3, false, {}, ['valid', 1], [''], ['   ']])(
    'rejects invalid selections without changing saved data: %j',
    async (invalid) => {
      const manager = new DefaultAIEmployeeManager(
        new MemoryAIEmployeeRepository(),
      );
      await manager.registerEmployee({ username: 'atlas' });
      await expect(
        manager.upsertEmployee({
          username: 'atlas',
          skillSettings: {
            skills: [],
            tools: [],
            enabledTools: invalid as unknown as string[],
          },
        }),
      ).rejects.toThrow('skillSettings.enabledTools');
      expect(
        (await manager.getEmployee('atlas'))?.skillSettings,
      ).not.toHaveProperty('enabledTools');
    },
  );

  it.each(
    [[], ['custom-ask', 'custom-ask', 'unknown-saved-name']].map(
      (enabledTools) => ({ enabledTools }),
    ),
  )(
    'retains every saved permission across registration, repository promotion and restart: $enabledTools',
    async ({ enabledTools }) => {
      const manager = new DefaultAIEmployeeManager(
        new MemoryAIEmployeeRepository(),
      );
      await manager.upsertEmployee({
        username: 'atlas',
        skillSettings: { skills: [], tools: savedTools, enabledTools },
      });
      await manager.registerEmployee({
        username: 'atlas',
        tools: [{ name: 'custom-ask', autoCall: true }],
      });
      const database = new MemoryAIEmployeeRepository();
      await manager.switchRepository(database);
      const restarted = new DefaultAIEmployeeManager(
        new MemoryAIEmployeeRepository(),
      );
      await restarted.registerEmployee({
        username: 'atlas',
        tools: [{ name: 'custom-ask', autoCall: true }],
      });
      await restarted.switchRepository(database);
      const saved = await restarted.getEmployee('atlas');
      expect(saved?.skillSettings.enabledTools).toEqual([
        ...new Set(enabledTools),
      ]);
      expect(saved?.skillSettings.tools).toEqual(savedTools);
      const enabled = await restarted.upsertEmployee({
        ...saved!,
        skillSettings: {
          ...saved!.skillSettings,
          enabledTools: ['custom-ask', 'custom-allow'],
        },
      });
      expect(enabled.skillSettings.tools).toEqual(savedTools);
    },
  );

  it.each([undefined, null])(
    'preserves permission-only edits with inherited selection %j through reload and repository switches',
    async (enabledTools) => {
      const manager = new DefaultAIEmployeeManager(
        new MemoryAIEmployeeRepository(),
      );
      const registered = {
        username: 'atlas',
        tools: [{ name: 'custom-ask', autoCall: true }],
      };
      await manager.registerEmployee(registered);
      const employee = (await manager.getEmployee('atlas'))!;
      await manager.upsertEmployee({
        ...employee,
        skillSettings: {
          ...employee.skillSettings,
          tools: [{ name: 'custom-ask', autoCall: false }],
          ...(enabledTools === undefined ? {} : { enabledTools }),
        },
      });
      const latest = {
        ...registered,
        tools: [
          ...registered.tools,
          { name: 'newly-registered', autoCall: true },
        ],
      };
      const expected = {
        tools: [
          { name: 'custom-ask', autoCall: false },
          { name: 'newly-registered', autoCall: true },
        ],
        skills: [],
        ...(enabledTools === undefined ? {} : { enabledTools }),
      };
      await manager.registerEmployee(latest);
      expect((await manager.getEmployee('atlas'))?.skillSettings).toEqual(
        expected,
      );
      const database = new MemoryAIEmployeeRepository();
      await manager.switchRepository(database);
      expect((await manager.getEmployee('atlas'))?.skillSettings).toEqual(
        expected,
      );
      const restarted = new DefaultAIEmployeeManager(
        new MemoryAIEmployeeRepository(),
      );
      await restarted.registerEmployee(latest);
      await restarted.switchRepository(database);
      expect((await restarted.getEmployee('atlas'))?.skillSettings).toEqual(
        expected,
      );
      await restarted.registerEmployee(latest);
      expect((await restarted.getEmployee('atlas'))?.skillSettings).toEqual(
        expected,
      );
    },
  );

  it('keeps destination explicit null rather than the source selection', async () => {
    const source = new MemoryAIEmployeeRepository();
    const destination = new MemoryAIEmployeeRepository();
    await source.create({
      values: {
        username: 'atlas',
        skillSettings: { skills: [], tools: [], enabledTools: ['source'] },
      },
    });
    await destination.create({
      values: {
        username: 'atlas',
        skillSettings: { skills: [], tools: [], enabledTools: null },
      },
    });
    const manager = new DefaultAIEmployeeManager(source);
    await manager.switchRepository(destination);
    expect(
      (await manager.getEmployee('atlas'))?.skillSettings.enabledTools,
    ).toBeNull();
    await manager.registerEmployee({ username: 'atlas' });
    expect(
      (await manager.getEmployee('atlas'))?.skillSettings.enabledTools,
    ).toBeNull();
  });
});
