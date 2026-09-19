import { createHash } from 'node:crypto';
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { generateDatabaseManifests } from '../database/database-manifests.js';

const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporary
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'database-manifests-'));
  temporary.push(root);
  const sourceDir = path.join(root, 'database');
  const outputDir = path.join(root, 'dist/database');
  for (const directory of [sourceDir, outputDir])
    await mkdir(path.join(directory, 'main/migrations'), { recursive: true });
  return { sourceDir, outputDir };
}

describe('database task build manifests', () => {
  it('seals final output deterministically and preserves each source identity when adding a migration', async () => {
    const options = await fixture();
    const source = 'export const value: number = 1;\n';
    await writeFile(
      path.join(options.sourceDir, 'main/migrations/001.ts'),
      source,
    );
    await writeFile(
      path.join(options.outputDir, 'main/migrations/001.js'),
      'export const value = 1;\n',
    );
    await generateDatabaseManifests(options);
    const manifestPath = path.join(
      options.outputDir,
      'main/migrations/.manifest.json',
    );
    const first = await readFile(manifestPath, 'utf8');
    const value = JSON.parse(first) as {
      version: number;
      files: Record<
        string,
        { sourceChecksum: string; artifactChecksum: string }
      >;
    };
    expect(value.version).toBe(1);
    expect(value.files['001.js']).toEqual({
      sourceChecksum: createHash('sha256').update(source).digest('hex'),
      artifactChecksum: createHash('sha256')
        .update(
          await readFile(
            path.join(options.outputDir, 'main/migrations/001.js'),
          ),
        )
        .digest('hex'),
    });
    await generateDatabaseManifests(options);
    expect(await readFile(manifestPath, 'utf8')).toBe(first);
    await writeFile(
      path.join(options.sourceDir, 'main/migrations/002.ts'),
      'export {};',
    );
    await writeFile(
      path.join(options.outputDir, 'main/migrations/002.js'),
      'export {};',
    );
    await generateDatabaseManifests(options);
    expect(JSON.parse(await readFile(manifestPath, 'utf8'))).toMatchObject({
      files: { '001.js': value.files['001.js'] },
    });
  });

  it('rejects missing output and stale output with no source', async () => {
    const options = await fixture();
    await writeFile(
      path.join(options.sourceDir, 'main/migrations/001.ts'),
      'export {};',
    );
    await expect(generateDatabaseManifests(options)).rejects.toThrow(
      'Missing compiled database task',
    );
    await writeFile(
      path.join(options.outputDir, 'main/migrations/001.js'),
      'export {};',
    );
    await writeFile(
      path.join(options.outputDir, 'main/migrations/old.js'),
      'export {};',
    );
    await expect(generateDatabaseManifests(options)).rejects.toThrow(
      'has no source',
    );
  });

  it('handles empty directories and excludes declarations and examples', async () => {
    const options = await fixture();
    await writeFile(
      path.join(options.sourceDir, 'main/migrations/example.ts.example'),
      'ignored',
    );
    await writeFile(
      path.join(options.sourceDir, 'main/migrations/types.d.ts'),
      'ignored',
    );
    await generateDatabaseManifests(options);
    expect(
      JSON.parse(
        await readFile(
          path.join(options.outputDir, 'main/migrations/.manifest.json'),
          'utf8',
        ),
      ),
    ).toEqual({ version: 1, files: {} });
  });

  it('rejects output left after deleting an entire source tree', async () => {
    const options = await fixture();
    await writeFile(
      path.join(options.outputDir, 'main/migrations/old.js'),
      'export {};',
    );
    await rm(options.sourceDir, { recursive: true });
    await expect(generateDatabaseManifests(options)).rejects.toThrow(
      'has no source',
    );
  });

  it('refuses to associate changed source with previously sealed output', async () => {
    const options = await fixture();
    const sourcePath = path.join(options.sourceDir, 'main/migrations/001.ts');
    await writeFile(sourcePath, 'export const value: number = 1;');
    await writeFile(
      path.join(options.outputDir, 'main/migrations/001.js'),
      'export const value = 1;',
    );
    await generateDatabaseManifests(options);
    await writeFile(sourcePath, 'export const value: number = 2;');
    await utimes(sourcePath, new Date(0), new Date(0));
    await expect(generateDatabaseManifests(options)).rejects.toThrow(
      'Previously sealed database task',
    );
  });

  it('rejects overlapping source and output trees', async () => {
    const options = await fixture();
    await expect(
      generateDatabaseManifests({
        ...options,
        outputDir: path.join(options.sourceDir, 'dist'),
      }),
    ).rejects.toThrow('must not overlap');
    await expect(
      generateDatabaseManifests({ ...options, outputDir: options.sourceDir }),
    ).rejects.toThrow('must not overlap');
  });
});
