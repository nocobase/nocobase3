import { describe, expect, it } from 'vitest';

import {
  AIEmployeeResources,
  AIResourceRegistrar,
  normalizeAISkillDirectories,
} from '../server/ai/index.js';
import type { AIEmployeeManager, ToolsManager } from '@nocobase/ai-employee';
import { createMockServer } from './mock-server.js';

import path from 'node:path';
const GOLDEN_EMPLOYEES = ['atlas', 'dex', 'ellis', 'lexi', 'vera', 'viz'];
describe('package AI resources', () => {
  it('registers package-owned definitions explicitly', async () => {
    const fixture = await createMockServer();
    await new AIEmployeeResources().registerAIResources(fixture.aiManager);
    const skills = await fixture.aiManager.skillsManager.listSkills();
    expect(skills.map((skill) => skill.name)).toContain('data-modeling');
    const employees = await fixture.aiManager.employeeManager.listEmployees();
    expect(new Set(employees.map((employee) => employee.username))).toEqual(
      new Set(GOLDEN_EMPLOYEES),
    );
    expect(
      await fixture.aiManager.employeeManager.getEmployee('atlas'),
    ).toMatchObject({
      builtIn: true,
      defaultPrompt: expect.stringContaining('orchestration lead'),
    });
    for (const username of ['dara', 'lina', 'nathan', 'orin']) {
      expect(
        await fixture.aiManager.employeeManager.getEmployee(username),
      ).toBeUndefined();
    }

    expect(
      await fixture.aiManager.toolsManager.getTools('application-validation'),
    ).toBeUndefined();
    expect(
      await fixture.aiManager.toolsManager.getTools('chartGenerator'),
    ).toMatchObject({
      definition: { name: 'chartGenerator' },
      introduction: {
        title: expect.stringContaining('@nocobase/app-plugin-ai-employee'),
        about: expect.stringContaining('@nocobase/app-plugin-ai-employee'),
      },
    });
  });

  it('executes Tool, MCP, Skill, Employee in order', async () => {
    const order: string[] = [];
    class OrderedRegistrar extends AIResourceRegistrar {
      protected override async registerTools(
        _toolsManager: ToolsManager,
      ): Promise<void> {
        order.push('tools');
      }

      protected override async loadMCP(
        _ai: import('@nocobase/ai-employee').AIManager,
      ): Promise<void> {
        order.push('mcp');
      }

      protected override async loadSkills(
        _ai: import('@nocobase/ai-employee').AIManager,
      ): Promise<void> {
        order.push('skills');
      }

      protected override async registerAIEmployees(
        _aiEmployeeManager: AIEmployeeManager,
      ): Promise<void> {
        order.push('employees');
      }
    }

    const fixture = await createMockServer();
    await new OrderedRegistrar().registerAIResources(fixture.aiManager);
    expect(order).toEqual(['tools', 'mcp', 'skills', 'employees']);
  });

  it('normalizes configured Skill paths relative to the App root', () => {
    expect(
      normalizeAISkillDirectories(
        [' skills ', '', 'shared', 'shared', '/absolute/skills'],
        '/app',
      ),
    ).toEqual(['/app/skills', '/app/shared', '/absolute/skills']);
  });

  it('does not register static resources twice when called repeatedly', async () => {
    const fixture = await createMockServer();
    const registrar = new AIEmployeeResources({ skillsDirectories: [] });
    await registrar.registerAIResources(fixture.aiManager);
    await registrar.registerAIResources(fixture.aiManager);
    expect(
      (await fixture.aiManager.employeeManager.listEmployees()).length,
    ).toBe(GOLDEN_EMPLOYEES.length);
  });

  it('skips missing Skill directories without failing registration', async () => {
    const fixture = await createMockServer();
    await expect(
      new AIEmployeeResources({
        skillsDirectories: [
          path.join('/tmp', 'missing-nocobase-skill-directory'),
        ],
      }).registerAIResources(fixture.aiManager),
    ).resolves.toBeUndefined();
  });
});
