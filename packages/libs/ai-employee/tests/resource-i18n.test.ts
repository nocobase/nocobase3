import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AIManager } from '../src/manager/index.js';
import { defineTools } from '../src/manager/tools/default.js';
import { SkillsLoader } from '../src/loader/skills.js';
import { MemoryRepositoryFactory } from '../src/repository/memory/factory.js';
import { buildTool } from '../src/utils/tools.js';

const tool = defineTools({
  scope: 'GENERAL',
  i18n: { namespace: 'tool-owner' },
  introduction: { title: 'Tool title', about: 'Tool documentation' },
  definition: {
    name: 'search',
    description: 'Raw model-facing tool instructions.',
    schema: { type: 'object', properties: {} },
  },
  invoke: async () => 'result',
});

describe('Tool and Skill i18n metadata', () => {
  const directories: string[] = [];
  afterEach(async () => {
    await Promise.all(
      directories
        .splice(0)
        .map((path) => rm(path, { recursive: true, force: true })),
    );
  });

  it('preserves tool metadata through registration, repository updates and model construction', async () => {
    const repositories = new MemoryRepositoryFactory();
    const ai = new AIManager({ repositories });
    await ai.toolsManager.registerTools(tool);
    expect(await repositories.toolsRepository.getTools('search')).toMatchObject(
      tool,
    );
    await repositories.toolsRepository.updateTools({
      name: 'search',
      value: { silence: true },
    });
    expect(await ai.toolsManager.listTools({})).toEqual([
      expect.objectContaining({ i18n: tool.i18n, silence: true }),
    ]);
    const stored = await ai.toolsManager.getTools('search');
    expect(stored).toBeDefined();
    expect(buildTool(stored!).description).toBe(tool.definition.description);
    await ai.toolsManager.registerTools({
      ...tool,
      i18n: { namespace: 'replacement' },
    });
    expect(
      (await repositories.toolsRepository.getTools('search'))?.i18n,
    ).toEqual({ namespace: 'replacement' });
  });

  it('retains dynamic tool metadata without persisting dynamic entries', async () => {
    const repositories = new MemoryRepositoryFactory();
    const ai = new AIManager({ repositories });
    ai.toolsManager.registerDynamicTools(async (registration) => {
      await registration.registerTools(tool);
    });
    expect(await ai.toolsManager.getTools('search')).toMatchObject({
      i18n: tool.i18n,
    });
    expect(await ai.toolsManager.listTools({})).toEqual([
      expect.objectContaining({ i18n: tool.i18n }),
    ]);
    expect(await repositories.toolsRepository.listTools()).toEqual([]);
  });

  it('loads Skill frontmatter without translating content or inheriting namespaces across associations', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'resource-i18n-'));
    directories.push(directory);
    for (const [name, metadata] of [
      ['localized', 'i18n:\n  namespace: skill-owner\n'],
      ['legacy', ''],
    ]) {
      await mkdir(join(directory, name));
      await writeFile(
        join(directory, name, 'SKILL.md'),
        `---\nname: ${name}\ndescription: Raw model-facing skill instructions.\nintroduction:\n  title: Skill title\n${metadata}tools:\n  - search\n---\nRaw skill content.\n`,
      );
    }
    const repositories = new MemoryRepositoryFactory();
    const ai = new AIManager({ repositories });
    await ai.toolsManager.registerTools(tool);
    await new SkillsLoader(ai, {
      scan: { basePath: directory, pattern: ['**/SKILL.md'] },
    }).load();
    const skill = await ai.skillsManager.getSkills('localized');
    expect(skill).toMatchObject({
      i18n: { namespace: 'skill-owner' },
      description: 'Raw model-facing skill instructions.',
      content: 'Raw skill content.\n',
      introduction: { title: 'Skill title' },
      tools: ['search'],
    });
    expect(skill).not.toHaveProperty('about');
    expect((await ai.skillsManager.getSkills('legacy'))?.i18n).toBeUndefined();
    expect((await ai.toolsManager.getTools('search'))?.i18n).toEqual(tool.i18n);
    await ai.skillsManager.registerSkills({
      scope: 'GENERAL',
      name: 'localized',
      description: 'Updated instructions',
      content: 'Updated content',
    });
    expect(
      await repositories.skillsRepository.getSkills('localized'),
    ).toMatchObject({ i18n: { namespace: 'skill-owner' } });
    expect(await ai.skillsManager.listSkills()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'localized',
          i18n: { namespace: 'skill-owner' },
        }),
      ]),
    );
  });
});
