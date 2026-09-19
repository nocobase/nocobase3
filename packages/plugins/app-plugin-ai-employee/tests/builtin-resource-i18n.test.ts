import { describe, expect, it } from 'vitest';

import enUS from '../client/locales/en-US.js';
import zhCN from '../client/locales/zh-CN.js';
import packageMetadata from '../package.json' with { type: 'json' };
import { AIEmployeeResources } from '../server/ai/index.js';
import builtInTools from '../server/ai/tools/index.js';
import { createMockServer } from './mock-server.js';

function expectDisplayTranslations(source: string | undefined): void {
  expect(source).toEqual(expect.any(String));
  expect(source).toMatch(/\S/u);
  expect(source).not.toMatch(/\{\{\s*t\s*\(/u);
  if (!source) throw new Error('Missing built-in display source text');

  // Direct property lookup verifies flat keys, including punctuation and spaces.
  expect(Object.hasOwn(enUS, source), source).toBe(true);
  expect(Object.hasOwn(zhCN, source), source).toBe(true);
  expect(Reflect.get(enUS, source), source).toBe(source);
  expect(Reflect.get(zhCN, source), source).toMatch(/[\u3400-\u9fff]/u);
}

describe('built-in Tool and Skill display translations', () => {
  it('gives every declared Tool an owning namespace and complete Client locales', () => {
    expect(builtInTools.length).toBeGreaterThan(0);
    for (const tool of builtInTools) {
      expect(tool.i18n, tool.definition.name).toEqual({
        namespace: packageMetadata.name,
      });
      expectDisplayTranslations(tool.introduction?.title);
      expectDisplayTranslations(tool.introduction?.about);
    }
  });

  it('preserves source metadata through registration, including factory-created data Tools', async () => {
    const { aiManager } = await createMockServer();
    await new AIEmployeeResources().registerAIResources(aiManager);
    for (const declaration of builtInTools) {
      const tool = await aiManager.toolsManager.getTools(
        declaration.definition.name,
      );
      expect(tool).toMatchObject({
        i18n: { namespace: packageMetadata.name },
        introduction: declaration.introduction,
        definition: {
          name: declaration.definition.name,
          description: declaration.definition.description,
        },
      });
    }
  });

  it('loads Skill namespaces and translates titles and descriptions without introducing about text', async () => {
    const { aiManager } = await createMockServer();
    await new AIEmployeeResources().registerAIResources(aiManager);
    const skills = await aiManager.skillsManager.listSkills();
    expect(skills.map((skill) => skill.name).sort()).toEqual([
      'business-analysis-report',
      'data-metadata',
      'data-query',
    ]);
    for (const skill of skills) {
      expect(skill.i18n, skill.name).toEqual({
        namespace: packageMetadata.name,
      });
      expectDisplayTranslations(skill.introduction?.title);
      expectDisplayTranslations(skill.description);
      expect(skill.introduction?.about).toBeUndefined();
    }
  });
});
