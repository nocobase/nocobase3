import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { AIEmployeeLoader } from '@nocobase/ai-employee';
import { MCPLoader } from '@nocobase/ai-employee';
import { SkillsLoader } from '@nocobase/ai-employee';
import { ToolsLoader } from '@nocobase/ai-employee';
import { createMockServer } from './mock-server.js';

const GOLDEN_EMPLOYEES = ['atlas', 'dex', 'ellis', 'lexi', 'vera', 'viz'];

const resourcePatterns = {
  tools: ['tools/chartGenerator.ts'],
  mcp: ['mcp/*.ts', 'mcp/*.js', '!mcp/*.d.ts'],
  skills: ['**/skills/**/SKILLS.md'],
  employees: [
    '**/employees/*.ts',
    '**/employees/*/index.ts',
    '**/employees/*.js',
    '**/employees/*/index.js',
    '**/employees/*/prompt.md',
    '!**/employees/**/*.d.ts',
  ],
};

describe('package AI resources', () => {
  it('discovers package-owned definitions with the generic resource loaders', async () => {
    const fixture = await createMockServer();
    const basePath = path.resolve(process.cwd(), 'ai');

    await new ToolsLoader(fixture.aiManager, {
      scan: { basePath, pattern: resourcePatterns.tools },
    }).load();
    await new MCPLoader(fixture.aiManager, {
      scan: { basePath, pattern: resourcePatterns.mcp },
    }).load();
    await new SkillsLoader(fixture.aiManager, {
      scan: { basePath, pattern: resourcePatterns.skills },
    }).load();
    await new AIEmployeeLoader(fixture.aiManager, {
      scan: { basePath, pattern: resourcePatterns.employees },
    }).load();

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

    expect(basePath).toBe(path.resolve(process.cwd(), 'ai'));
  });
});
