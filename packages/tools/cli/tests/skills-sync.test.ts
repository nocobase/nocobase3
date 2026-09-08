import { createRequire } from 'node:module';
import { symlink } from 'node:fs/promises';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  applySkillsSync,
  isOwnedSkillName,
  planSkillsSync,
  pluginSkillPrefix,
  resolveInstalledPlugins,
} from '../src/lib/skills-sync.ts';

const created: string[] = [];

afterEach(async () => {
  await Promise.all(
    created
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

async function createApp(
  registry: Record<string, { enabled: boolean }> = {},
): Promise<string> {
  const appRoot = await mkdtemp(path.join(os.tmpdir(), 'nb3-skills-'));
  created.push(appRoot);
  await writeFile(
    path.join(appRoot, 'package.json'),
    JSON.stringify({ name: 'demo-app' }),
  );
  await writeRegisteredPlugins(
    appRoot,
    Object.entries(registry)
      .filter(([, value]) => value.enabled)
      .map(([name]) => name),
  );
  return appRoot;
}

async function installPlugin(
  appRoot: string,
  packageName: string,
  skills: Record<string, string> = {},
): Promise<void> {
  const pluginRoot = path.join(appRoot, 'node_modules', packageName);
  await mkdir(pluginRoot, { recursive: true });
  await writeFile(
    path.join(pluginRoot, 'package.json'),
    JSON.stringify({ name: packageName, version: '1.0.0' }),
  );
  for (const [skillName, body] of Object.entries(skills)) {
    const skillRoot = path.join(pluginRoot, 'skills', skillName);
    await mkdir(skillRoot, { recursive: true });
    await writeFile(path.join(skillRoot, 'SKILL.md'), body);
  }
}

async function writeAppSkill(
  appRoot: string,
  skillName: string,
  body: string,
): Promise<void> {
  const skillRoot = path.join(appRoot, '.agents', 'skills', skillName);
  await mkdir(skillRoot, { recursive: true });
  await writeFile(path.join(skillRoot, 'SKILL.md'), body);
}

async function syncApp(appRoot: string, plugin?: string): Promise<void> {
  const { appPackageName, plugins } = await resolveInstalledPlugins({
    appRoot,
    plugin,
  });
  await applySkillsSync(
    await planSkillsSync({ appPackageName, appRoot, plugins }),
  );
}

describe('pluginSkillPrefix', () => {
  it('drops the scope and keeps the package name', () => {
    expect(pluginSkillPrefix('@nocobase/app-plugin-workflow')).toBe(
      'nocobase-app-plugin-workflow',
    );
  });

  it('rejects a package outside the scope', () => {
    expect(() => pluginSkillPrefix('workflow')).toThrow('must start with');
  });

  it('claims its own name and its suffixed names only', () => {
    const prefix = 'nocobase-app-plugin-workflow';
    expect(isOwnedSkillName(prefix, prefix)).toBe(true);
    expect(isOwnedSkillName(prefix, `${prefix}-trigger`)).toBe(true);
    expect(isOwnedSkillName(prefix, 'nocobase-app-plugin-other')).toBe(false);
  });
});

describe('skills synchronization', () => {
  it('copies every skill a registered plugin ships', async () => {
    const appRoot = await createApp({
      '@nocobase/app-plugin-demo': { enabled: true },
    });
    await installPlugin(appRoot, '@nocobase/app-plugin-demo', {
      'nocobase-app-plugin-demo': '# main',
      'nocobase-app-plugin-demo-extra': '# extra',
    });

    await syncApp(appRoot);

    expect(
      (await readdir(path.join(appRoot, '.agents', 'skills'))).sort(),
    ).toEqual(['nocobase-app-plugin-demo', 'nocobase-app-plugin-demo-extra']);
  });

  it('replaces a locally modified skill, because upstream owns it', async () => {
    const appRoot = await createApp({
      '@nocobase/app-plugin-demo': { enabled: true },
    });
    await installPlugin(appRoot, '@nocobase/app-plugin-demo', {
      'nocobase-app-plugin-demo': '# upstream',
    });
    await writeAppSkill(appRoot, 'nocobase-app-plugin-demo', '# edited');

    await syncApp(appRoot);

    const contents = await readFile(
      path.join(
        appRoot,
        '.agents',
        'skills',
        'nocobase-app-plugin-demo',
        'SKILL.md',
      ),
      'utf8',
    );
    expect(contents).toBe('# upstream');
  });

  it('removes a skill the plugin no longer ships', async () => {
    const appRoot = await createApp({
      '@nocobase/app-plugin-demo': { enabled: true },
    });
    await installPlugin(appRoot, '@nocobase/app-plugin-demo', {
      'nocobase-app-plugin-demo': '# main',
    });
    await writeAppSkill(appRoot, 'nocobase-app-plugin-demo-gone', '# stale');

    await syncApp(appRoot);

    expect(await readdir(path.join(appRoot, '.agents', 'skills'))).toEqual([
      'nocobase-app-plugin-demo',
    ]);
  });

  it('never touches a directory the application owns', async () => {
    const appRoot = await createApp({
      '@nocobase/app-plugin-demo': { enabled: true },
    });
    await installPlugin(appRoot, '@nocobase/app-plugin-demo', {
      'nocobase-app-plugin-demo': '# main',
    });
    await writeAppSkill(appRoot, 'my-own-skill', '# mine');

    await syncApp(appRoot);

    const contents = await readFile(
      path.join(appRoot, '.agents', 'skills', 'my-own-skill', 'SKILL.md'),
      'utf8',
    );
    expect(contents).toBe('# mine');
  });

  it('leaves another plugin’s skills alone when limited to one plugin', async () => {
    const appRoot = await createApp({
      '@nocobase/app-plugin-one': { enabled: true },
      '@nocobase/app-plugin-two': { enabled: true },
    });
    await installPlugin(appRoot, '@nocobase/app-plugin-one', {
      'nocobase-app-plugin-one': '# one',
    });
    await installPlugin(appRoot, '@nocobase/app-plugin-two', {
      'nocobase-app-plugin-two': '# two',
    });
    await writeAppSkill(appRoot, 'nocobase-app-plugin-two', '# existing two');

    await syncApp(appRoot, 'one');

    const contents = await readFile(
      path.join(
        appRoot,
        '.agents',
        'skills',
        'nocobase-app-plugin-two',
        'SKILL.md',
      ),
      'utf8',
    );
    expect(contents).toBe('# existing two');
  });

  it('rejects a skill directory outside the plugin prefix', async () => {
    const appRoot = await createApp({
      '@nocobase/app-plugin-demo': { enabled: true },
    });
    await installPlugin(appRoot, '@nocobase/app-plugin-demo', {
      'nocobase-something-else': '# wrong',
    });

    await expect(syncApp(appRoot)).rejects.toThrow('Invalid skill directory');
  });

  it('skips a plugin that ships no skills', async () => {
    const appRoot = await createApp({
      '@nocobase/app-plugin-demo': { enabled: true },
    });
    await installPlugin(appRoot, '@nocobase/app-plugin-demo');

    const { appPackageName, plugins } = await resolveInstalledPlugins({
      appRoot,
    });
    const plan = await planSkillsSync({ appPackageName, appRoot, plugins });

    expect(plan.copies).toEqual([]);
    expect(plan.removals).toEqual([]);
  });

  it('reports a plugin that is registered but not installed', async () => {
    const appRoot = await createApp({
      '@nocobase/app-plugin-missing': { enabled: true },
    });

    await expect(resolveInstalledPlugins({ appRoot })).rejects.toThrow(
      'is not installed',
    );
  });
});

async function writeRegisteredPlugins(
  appRoot: string,
  packages: string[],
): Promise<void> {
  await mkdir(path.join(appRoot, 'server'), { recursive: true });
  await mkdir(path.join(appRoot, 'node_modules'), { recursive: true });
  await symlink(
    path.dirname(
      createRequire(import.meta.url).resolve('typescript/package.json'),
    ),
    path.join(appRoot, 'node_modules/typescript'),
  );
  await writeFile(
    path.join(appRoot, 'server/plugins.ts'),
    packages
      .map((name, index) => `import p${index} from '${name}/server';`)
      .join('\n') +
      `\nexport default defineServerPlugins([${packages.map((_, index) => `p${index}`).join(', ')}]);`,
  );
}

describe('composition-based plugin discovery', () => {
  it('deduplicates both runtimes and ignores unused imports and legacy metadata', async () => {
    const appRoot = await createApp({
      '@nocobase/app-plugin-one': { enabled: true },
    });
    await installPlugin(appRoot, '@nocobase/app-plugin-one');
    await installPlugin(appRoot, '@nocobase/app-plugin-two');
    await installPlugin(appRoot, '@nocobase/app-plugin-cli-only');
    await mkdir(path.join(appRoot, 'cli'), { recursive: true });
    await writeFile(
      path.join(appRoot, 'cli/plugins.ts'),
      `
      import cliOnly from '@nocobase/app-plugin-cli-only/cli';
      export default defineCliPlugins([cliOnly]);
    `,
    );
    await mkdir(path.join(appRoot, 'client'), { recursive: true });
    await writeFile(
      path.join(appRoot, 'client/plugins.ts'),
      `
      import one from '@nocobase/app-plugin-one/client';
      import two from '@nocobase/app-plugin-two/client/plugin';
      import unused from '@nocobase/app-plugin-unused/client';
      export default defineClientPlugins([one(), two({ example: true })]);
    `,
    );
    await writeFile(
      path.join(appRoot, 'package.json'),
      JSON.stringify({
        name: 'demo-app',
        nocobase: {
          plugins: { '@nocobase/app-plugin-unused': { enabled: true } },
        },
      }),
    );
    const result = await resolveInstalledPlugins({ appRoot });
    expect(result.plugins.map((plugin) => plugin.packageName)).toEqual([
      '@nocobase/app-plugin-cli-only',
      '@nocobase/app-plugin-one',
      '@nocobase/app-plugin-two',
    ]);
  });
});
