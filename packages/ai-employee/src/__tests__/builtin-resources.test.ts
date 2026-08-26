import { describe, expect, it } from 'vitest';
import path from 'node:path';

import { AIEmployeeLoader } from '../loader/employee.js';
import { MCPLoader } from '../loader/mcp.js';
import { SkillsLoader } from '../loader/skills.js';
import { ToolsLoader } from '../loader/tools.js';
import { createMockServer } from './mock-server.js';

const GOLDEN_EMPLOYEES = [
  'atlas',
  'dara',
  'dex',
  'ellis',
  'form_assistant',
  'lexi',
  'lina',
  'nathan',
  'vera',
  'viz',
];

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

describe('package built-in AI resources', () => {
  it('discovers package-owned definitions with the generic resource loaders', async () => {
    const fixture = await createMockServer();
    const basePath = path.resolve(process.cwd(), 'src', 'builtin');

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
    expect(
      await fixture.aiManager.employeeManager.getEmployee('nathan'),
    ).toMatchObject({
      category: 'developer',
      skillSettings: { skills: ['frontend-developer'] },
    });
    expect(
      await fixture.aiManager.employeeManager.getEmployee('orin'),
    ).toBeUndefined();

    expect(
      await fixture.aiManager.toolsManager.getTools('application-validation'),
    ).toBeUndefined();
    expect(
      await fixture.aiManager.toolsManager.getTools('chartGenerator'),
    ).toMatchObject({
      definition: { name: 'chartGenerator' },
    });

    expect(basePath).toBe(path.resolve(process.cwd(), 'src', 'builtin'));
  });
});
