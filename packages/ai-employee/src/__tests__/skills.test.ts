/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { createMockServer, type TestAI } from './mock-server.js';
import { SkillsLoader } from '../loader/skills.js';
import path from 'path';
import { AIManager } from '../manager/index.js';
import type { SkillsManager } from '../manager/skills/types.js';
import { readFile } from 'fs/promises';
import matter from 'gray-matter';

describe('Skills loader test cases', () => {
  const basePath = path.resolve(
    process.cwd(),
    'src/__tests__',
    'resource',
    'ai',
  );
  let app: TestAI;
  let aiManager: AIManager;
  let skillsManager: SkillsManager;
  let loader: SkillsLoader;

  beforeEach(async () => {
    app = await createMockServer({
      plugins: ['nocobase'],
    });
    // with mysql add ai plugin in createMockServer will occur error with create usersAiEmployees collection at app startup

    aiManager = app.aiManager;
    skillsManager = aiManager.skillsManager;
    loader = new SkillsLoader(aiManager, {
      scan: { basePath, pattern: ['**/skills/**/SKILLS.md'] },
    });
  });

  afterEach(async () => {
    await app.destroy?.();
  });

  it('should load skills in skills root directory ', async () => {
    await loader.load();
    await app.init();
    const skillsMarkdown = await readFile(
      path.resolve(basePath, 'skills', 'data-modeling', 'SKILLS.md'),
      'utf-8',
    );
    const { content } = matter(skillsMarkdown);
    const skills = await skillsManager.getSkills('data-modeling');
    expect(skills).toBeDefined();
    expect(skills.name).eq('data-modeling');
    expect(skills.description).eq(
      'helps translate business scenarios into normalized database schemas with table declarations and relationship diagrams.',
    );
    expect(skills.content).eq(content);
    expect(skills.tools.sort()).toEqual(['search', 'read'].sort());
  });
});
