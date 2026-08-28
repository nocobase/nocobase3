import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_HUB_TEMPLATE,
  DEFAULT_REGISTRY,
  downloadTemplate,
  isLocalTemplateSource,
} from '../src/lib/template.ts';

const created: string[] = [];

afterEach(async () => {
  await Promise.all(
    created.splice(0).map((directory) =>
      rm(directory, {
        force: true,
        recursive: true,
      }),
    ),
  );
});

describe('template defaults', () => {
  it('downloads the latest self-contained Hub from the NocoBase Registry', () => {
    expect(DEFAULT_HUB_TEMPLATE).toBe('@nocobase/hub@latest');
    expect(DEFAULT_REGISTRY).toBe('https://npm.nocobase.ai');
  });

  it('recognizes package names and local paths', () => {
    expect(isLocalTemplateSource('./packages/hub/dist')).toBe(true);
    expect(isLocalTemplateSource('/tmp/hub')).toBe(true);
    expect(isLocalTemplateSource('@nocobase/hub@latest')).toBe(false);
  });
});

describe('downloadTemplate', () => {
  it('packs and extracts a local Hub package', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'create-hub-pack-'));
    created.push(directory);
    await mkdir(path.join(directory, 'server'));
    await writeFile(
      path.join(directory, 'server/standalone.js'),
      'export {};\n',
    );
    await writeFile(
      path.join(directory, 'package.json'),
      JSON.stringify({
        name: '@nocobase/hub',
        version: '1.2.3',
        files: ['server'],
      }),
    );

    const template = await downloadTemplate({ source: directory });
    created.push(template.directory);

    expect(template.name).toBe('@nocobase/hub');
    expect(template.version).toBe('1.2.3');
  });

  it('rejects a package without the standalone Hub entry', async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), 'create-hub-invalid-'),
    );
    created.push(directory);
    await writeFile(
      path.join(directory, 'package.json'),
      JSON.stringify({ name: 'not-a-hub', version: '1.0.0' }),
    );

    await expect(downloadTemplate({ source: directory })).rejects.toThrow(
      /standalone Hub entry/u,
    );
  });
});
