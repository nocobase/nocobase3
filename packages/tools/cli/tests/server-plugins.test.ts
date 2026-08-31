import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createServerPluginsEditor,
  readServerPlugins,
  serverPluginEntrySpecifier,
  serverPluginsPath,
} from '../src/lib/server-plugins.ts';

const created: string[] = [];
const require = createRequire(import.meta.url);

afterEach(async () => {
  await Promise.all(
    created
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

function moduleDirectory(packageName: string): string {
  return path.dirname(require.resolve(`${packageName}/package.json`));
}

async function createApp(): Promise<string> {
  const appRoot = await mkdtemp(path.join(os.tmpdir(), 'nb3-server-'));
  created.push(appRoot);
  await writeFile(
    path.join(appRoot, 'package.json'),
    JSON.stringify({ name: 'demo-app' }),
  );
  await mkdir(path.join(appRoot, 'node_modules'), { recursive: true });
  await symlink(
    moduleDirectory('typescript'),
    path.join(appRoot, 'node_modules', 'typescript'),
    'dir',
  );
  return appRoot;
}

function sourceWith(...shortNames: string[]): string {
  const imports = shortNames
    .map(
      (name) => `import ${name} from '@nocobase/app-plugin-${name}/server';\n`,
    )
    .join('');
  const array =
    shortNames.length === 0
      ? '[]'
      : `[\n${shortNames.map((name) => `  ${name},\n`).join('')}]`;
  return `${imports}import {
  defineServerPlugins,
  type AppServerPlugins,
} from '@nocobase/app-server/plugins';

const serverPlugins: AppServerPlugins = defineServerPlugins(${array});

export default serverPlugins;
`;
}

describe('server plugin source editor', () => {
  it('uses the public server plugin export', () => {
    expect(serverPluginEntrySpecifier('@nocobase/app-plugin-audit-log')).toBe(
      '@nocobase/app-plugin-audit-log/server',
    );
  });

  it('adds a bare plugin definition to the composition array', async () => {
    const editor = await createServerPluginsEditor(await createApp());
    const added = editor.add(
      sourceWith('alpha'),
      '@nocobase/app-plugin-audit-log',
    );

    expect(added.sourceText).toContain(
      "import auditLog from '@nocobase/app-plugin-audit-log/server';",
    );
    expect(added.sourceText).toContain('  auditLog');
    expect(added.sourceText).not.toContain('auditLog()');
    expect(editor.list(added.sourceText)).toEqual([
      { localName: 'alpha', packageName: '@nocobase/app-plugin-alpha' },
      {
        localName: 'auditLog',
        packageName: '@nocobase/app-plugin-audit-log',
      },
    ]);
  });

  it('is idempotent and round-trips through removal', async () => {
    const editor = await createServerPluginsEditor(await createApp());
    const original = sourceWith('alpha', 'beta');
    const added = editor.add(original, '@nocobase/app-plugin-audit-log');

    expect(
      editor.add(added.sourceText, '@nocobase/app-plugin-audit-log').changed,
    ).toBe(false);
    expect(
      editor.remove(added.sourceText, '@nocobase/app-plugin-audit-log')
        .sourceText,
    ).toBe(original);
  });

  it('preserves a generic defineServerPlugins call', async () => {
    const editor = await createServerPluginsEditor(await createApp());
    const source = sourceWith('alpha').replace(
      'defineServerPlugins([',
      'defineServerPlugins<AppConfig>([',
    );

    const added = editor.add(source, '@nocobase/app-plugin-audit-log');

    expect(added.sourceText).toContain('defineServerPlugins<AppConfig>([');
  });

  it('keeps package imports before relative imports', async () => {
    const editor = await createServerPluginsEditor(await createApp());
    const source = sourceWith('alpha').replace(
      '\nconst serverPlugins:',
      "\n\nimport type { AppConfig } from './config/index.js';\n\nconst serverPlugins:",
    );

    const added = editor.add(source, '@nocobase/app-plugin-audit-log');
    const pluginImport = added.sourceText.indexOf(
      "import auditLog from '@nocobase/app-plugin-audit-log/server';",
    );
    const relativeImport = added.sourceText.indexOf(
      "import type { AppConfig } from './config/index.js';",
    );

    expect(pluginImport).toBeGreaterThan(-1);
    expect(relativeImport).toBeGreaterThan(pluginImport);
  });
});

describe('readServerPlugins', () => {
  it('provides an editable default when the file is absent', async () => {
    const appRoot = await createApp();
    const file = await readServerPlugins(appRoot);
    const editor = await createServerPluginsEditor(appRoot);

    expect(file.exists).toBe(false);
    expect(file.filePath).toBe(serverPluginsPath(appRoot));
    expect(editor.list(file.sourceText)).toEqual([]);
    expect(
      editor.add(file.sourceText, '@nocobase/app-plugin-audit-log').changed,
    ).toBe(true);
  });

  it('reads an existing server composition root', async () => {
    const appRoot = await createApp();
    const filePath = serverPluginsPath(appRoot);
    const source = sourceWith('alpha');
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, source);

    expect(await readFile(filePath, 'utf8')).toBe(source);
    expect(await readServerPlugins(appRoot)).toEqual({
      exists: true,
      filePath,
      sourceText: source,
    });
  });
});
