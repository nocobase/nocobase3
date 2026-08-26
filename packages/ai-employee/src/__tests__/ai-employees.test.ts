/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { createMockServer, type TestAI } from './mock-server.js';
import { AIEmployeeLoader } from '../loader/employee.js';
import path from 'path';
import { AIManager } from '../manager/index.js';
import type { AIEmployeeManager } from '../manager/ai-employee/types.js';
import type { AIEmployeeEntity } from '../app/repository/index.js';

const normalizeEOL = (value: string) => value.replace(/\r\n?/g, '\n');
const normalizeTools = (entry: AIEmployeeEntity) =>
  [...(entry.skillSettings?.tools ?? [])].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
const normalizeSkills = (entry: AIEmployeeEntity) =>
  [...(entry.skillSettings?.skills ?? [])].sort();

describe('AI employee loader test cases', () => {
  const basePath = path.resolve(
    process.cwd(),
    'src/__tests__',
    'resource',
    'ai',
  );
  let app: TestAI;
  let aiManager: AIManager;
  let employeeManager: AIEmployeeManager;
  let loader: AIEmployeeLoader;

  beforeEach(async () => {
    app = await createMockServer({
      plugins: ['nocobase'],
    });

    aiManager = app.aiManager;
    employeeManager = aiManager.employeeManager;
    loader = new AIEmployeeLoader(aiManager, {
      scan: {
        basePath,
        pattern: [
          '**/ai-employees/*.ts',
          '**/ai-employees/*/index.ts',
          '**/ai-employees/*.js',
          '**/ai-employees/*/index.js',
          '**/ai-employees/*/prompt.md',
          '!**/ai-employees/**/*.d.ts',
        ],
      },
    });
  });

  afterEach(async () => {
    await app.destroy?.();
  });

  it('should load ai employee from named file', async () => {
    await loader.load();
    await app.init();
    const employee = await employeeManager.getEmployee('named-file-employee');

    expect(employee).toBeDefined();
    expect(employee.username).toBe('named-file-employee');
    expect(employee.nickname).toBe('Named File Employee');
    expect(normalizeTools(employee)).toEqual([]);
    expect(normalizeSkills(employee)).toEqual([]);
  });

  it('should load ai employee from index file', async () => {
    await loader.load();
    await app.init();
    const employee = await employeeManager.getEmployee('index-employee');

    expect(employee).toBeDefined();
    expect(employee.username).toBe('index-employee');
    expect(employee.nickname).toBe('Index Employee');
    expect(normalizeEOL(employee.defaultPrompt)).toBe(
      'Prompt from markdown file.\n',
    );
    expect(normalizeTools(employee)).toEqual([]);
    expect(normalizeSkills(employee)).toEqual([]);
  });

  it('should load ai employee with tools directory', async () => {
    await loader.load();
    await app.init();
    const employee = await employeeManager.getEmployee('with-tools');

    expect(employee).toBeDefined();
    expect(normalizeTools(employee)).toEqual([{ name: 'discoveredTool' }]);
  });

  it('should load ai employee with skills directory', async () => {
    await loader.load();
    await app.init();
    const employee = await employeeManager.getEmployee('with-skills');

    expect(employee).toBeDefined();
    expect(normalizeSkills(employee)).toEqual(['analysis']);
  });

  it('should merge ai employee tools directory with tools config', async () => {
    await loader.load();
    await app.init();
    const employee = await employeeManager.getEmployee('with-tools-merge');

    expect(employee).toBeDefined();
    expect(normalizeTools(employee)).toEqual([
      { autoCall: true, name: 'configuredTool' },
      { name: 'discoveredTool' },
    ]);
  });

  it('should merge ai employee skills directory with skills config', async () => {
    await loader.load();
    await app.init();
    const employee = await employeeManager.getEmployee('with-skills-merge');

    expect(employee).toBeDefined();
    expect(normalizeSkills(employee)).toEqual([
      'configured-skill',
      'discovered-skill',
    ]);
  });
});
