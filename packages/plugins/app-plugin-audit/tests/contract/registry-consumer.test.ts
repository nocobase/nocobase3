import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import packageMetadata from '../../package.json' with { type: 'json' };

const root = fileURLToPath(new URL('../../../../../', import.meta.url));
const owner = resolve(root, 'packages/plugins/app-plugin-audit');

describe('canonical Skill and client Registry delivery', () => {
  it('materializes the published recipe and validates its assets and Skill links', async () => {
    const app = await mkdtemp(join(tmpdir(), 'g21-registry-contract-'));
    try {
      execFileSync(process.execPath, [
        join(root, 'scripts/registry.mjs'),
        'build',
        '--package',
        owner,
      ]);
      execFileSync(process.execPath, [
        join(root, 'scripts/registry.mjs'),
        'materialize',
        '--package',
        owner,
        '--item',
        'events-panel',
        '--output-root',
        app,
      ]);
      const installed = await readFile(
        join(app, 'client/extensions/nocobase-audit-events-panel/index.tsx'),
        'utf8',
      );
      expect(installed).toBe(
        await readFile(join(owner, 'registry/events-panel/index.tsx'), 'utf8'),
      );
      const json = JSON.parse(
        await readFile(join(owner, 'public/r/events-panel.json'), 'utf8'),
      ) as { files: { content: string }[] };
      expect(json.files.some((file) => file.content === installed)).toBe(true);
      for (const path of [
        'skills',
        'registry',
        'registry.config.json',
        'public/r',
      ])
        expect(packageMetadata.files).toContain(path);
      const skillRoot = join(owner, 'skills/nocobase-app-plugin-audit');
      const skill = await readFile(join(skillRoot, 'SKILL.md'), 'utf8');
      for (const match of skill.matchAll(/\]\(([^)]+)\)/g))
        expect(await readFile(join(skillRoot, match[1]), 'utf8')).not.toBe('');
    } finally {
      await rm(app, { recursive: true, force: true });
    }
  });
});
