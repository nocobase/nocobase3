import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { generateDatabaseManifests } from '@nocobase/dev-config/build/database-manifests';
import {
  readTaskManifest,
  resolveTaskChecksum,
} from '../../../src/migration/manifest.js';

const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporary
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'task-manifest-'));
  temporary.push(root);
  const sourceDir = path.join(root, 'migrations');
  const outputDir = path.join(root, 'dist/migrations');
  await mkdir(sourceDir, { recursive: true });
  await mkdir(outputDir, { recursive: true });
  const source = 'export const value: number = 1;\n';
  const original = 'export const value = 1;\n';
  await writeFile(path.join(sourceDir, '001.ts'), source);
  await writeFile(path.join(outputDir, '001.js'), original);
  await generateDatabaseManifests({ sourceDir, outputDir });
  return { sourceDir, outputDir, source, original };
}

describe('database task artifact checksums', () => {
  it('uses the same history checksum for source and compiled modules and verifies legacy JS', async () => {
    const f = await fixture();
    const filePath = path.join(f.outputDir, '001.js');
    const manifest = await readTaskManifest(f.outputDir);
    const result = resolveTaskChecksum(
      filePath,
      await readFile(filePath, 'utf8'),
      manifest,
    );
    expect(result.checksum).toBe(
      resolveTaskChecksum(path.join(f.sourceDir, '001.ts'), f.source, undefined)
        .checksum,
    );
    expect(result.legacyChecksum).toBe(
      resolveTaskChecksum('001.js', f.original, undefined).checksum,
    );
  });

  it('requires a manifest for sealed output while allowing handwritten JavaScript', async () => {
    const f = await fixture();
    await rm(path.join(f.outputDir, '.manifest.json'));
    const filePath = path.join(f.outputDir, '001.js');
    const content = await readFile(filePath, 'utf8');
    expect(() => resolveTaskChecksum(filePath, content, undefined)).toThrow(
      'requires .manifest.json',
    );
    expect(() =>
      resolveTaskChecksum(filePath, content + '// extra', undefined),
    ).toThrow('requires .manifest.json');
    expect(
      resolveTaskChecksum('manual.js', 'export {};', undefined).checksum,
    ).toHaveLength(64);
  });

  it.each([
    'modified',
    'missing',
    'unlisted',
    'invalid-version',
    'missing-entry',
  ])('rejects %s artifacts before importing modules', async (mode) => {
    const f = await fixture();
    const filePath = path.join(f.outputDir, '001.js');
    if (mode === 'modified')
      await writeFile(filePath, 'throw new Error("must not import");');
    if (mode === 'missing') await rm(filePath);
    if (mode === 'unlisted')
      await writeFile(
        path.join(f.outputDir, '002.js'),
        'throw new Error("must not import");',
      );
    if (mode === 'invalid-version')
      await writeFile(
        path.join(f.outputDir, '.manifest.json'),
        '{"version":2,"files":{}}',
      );
    if (mode === 'missing-entry')
      await writeFile(
        path.join(f.outputDir, '.manifest.json'),
        '{"version":1,"files":{}}',
      );
    await expect(readTaskManifest(f.outputDir)).rejects.toThrow();
  });
});
