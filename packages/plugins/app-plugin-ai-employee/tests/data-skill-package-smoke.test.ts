import {
  cp,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { AIManager, MemoryRepositoryFactory } from '@nocobase/ai-employee';
import { expect, it } from 'vitest';

// Run after the plugin build: AI_SKILLS_PACKAGE_SMOKE=1 pnpm test tests/data-skill-package-smoke.test.ts
it
  .runIf(process.env.AI_SKILLS_PACKAGE_SMOKE === '1')
  .each(['published', 'deployed'] as const)(
  'loads %s package Markdown through the compiled registrar without server source files',
  async (mode) => {
    const packageRoot = fileURLToPath(new URL('../', import.meta.url));
    const temporary = await mkdtemp(
      path.join(os.tmpdir(), 'ai-skills-package-'),
    );
    const expected = {
      'data-metadata': [
        'getDataSources',
        'getCollectionNames',
        'getCollectionMetadata',
        'searchFieldMetadata',
      ],
      'data-query': ['dataSourceQuery', 'dataSourceCounting', 'dataQuery'],
      'business-analysis-report': ['businessReportGenerator', 'getSkill'],
    };
    try {
      expect(
        existsSync(path.join(packageRoot, 'dist/server/ai/index.js')),
        'Build @nocobase/app-plugin-ai-employee before running this smoke test',
      ).toBe(true);
      const manifest = JSON.parse(
        await readFile(path.join(packageRoot, 'package.json'), 'utf8'),
      );
      expect(manifest.files).toContain('ai');
      expect(manifest.files).toContain('dist');
      await cp(path.join(packageRoot, 'dist'), path.join(temporary, 'dist'), {
        recursive: true,
      });
      if (mode === 'published') {
        await cp(path.join(packageRoot, 'ai'), path.join(temporary, 'ai'), {
          recursive: true,
        });
        // Exercise fallback past tsc's intermediate dist/package.json.
        await rm(path.join(temporary, 'dist/ai/skills'), {
          recursive: true,
          force: true,
        });
      }
      await writeFile(
        path.join(temporary, 'package.json'),
        JSON.stringify(manifest),
      );
      await symlink(
        path.join(packageRoot, 'node_modules'),
        path.join(temporary, 'node_modules'),
        'dir',
      );
      expect(existsSync(path.join(temporary, 'server'))).toBe(false);
      expect(existsSync(path.join(temporary, 'src'))).toBe(false);

      // A per-copy marker proves the registrar reads this package's assets rather
      // than accidentally finding the checkout through a dependency symlink.
      for (const name of Object.keys(expected)) {
        const markdown = path.join(
          temporary,
          mode === 'deployed' ? 'dist/ai/skills' : 'ai/skills',
          name,
          'SKILL.md',
        );
        await writeFile(
          markdown,
          `${await readFile(markdown, 'utf8')}\nPackaged asset ${name}.\n`,
        );
      }
      const compiled = await import(
        /* @vite-ignore */ pathToFileURL(
          path.join(temporary, 'dist/server/ai/index.js'),
        ).href
      );
      const ai = new AIManager({ repositories: new MemoryRepositoryFactory() });
      await new compiled.AIEmployeeResources().registerAIResources(ai);
      for (const [name, tools] of Object.entries(expected)) {
        expect(await ai.skillsManager.getSkills(name)).toMatchObject({
          name,
          scope: 'GENERAL',
          tools,
          content: expect.stringContaining(`Packaged asset ${name}.`),
        });
        for (const tool of tools) {
          expect(await ai.toolsManager.getTools(tool)).toMatchObject({
            definition: { name: tool },
            invoke: expect.any(Function),
          });
        }
      }
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  },
  30_000,
);
