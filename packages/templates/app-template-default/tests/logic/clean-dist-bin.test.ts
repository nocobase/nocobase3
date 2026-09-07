// @vitest-environment node

import { execFileSync, spawnSync } from 'node:child_process';
import {
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

const scriptPath = path.resolve('scripts/clean-dist-bin.mjs');
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('release artifact materialization', () => {
  it('removes nested bins and materializes internal symlinks', () => {
    const root = temporaryDirectory();
    const dist = path.join(root, 'dist');
    const vendor = path.join(dist, 'vendor', 'demo');
    const dependency = path.join(dist, 'node_modules', 'demo');
    const bin = path.join(
      dist,
      'node_modules',
      'nested',
      'node_modules',
      '.bin',
    );

    mkdirSync(vendor, { recursive: true });
    mkdirSync(bin, { recursive: true });
    writeFileSync(path.join(vendor, 'index.js'), 'export default true;\n');
    symlinkSync(path.relative(path.dirname(dependency), vendor), dependency);
    symlinkSync(
      path.relative(bin, path.join(vendor, 'index.js')),
      path.join(bin, 'demo'),
    );

    execFileSync(process.execPath, [scriptPath, dist]);

    expect(lstatSync(dependency).isSymbolicLink()).toBe(false);
    expect(readFileSync(path.join(dependency, 'index.js'), 'utf8')).toBe(
      'export default true;\n',
    );
    expect(() => lstatSync(bin)).toThrow();
  });

  it('rejects symlinks whose final target is outside dist', () => {
    const root = temporaryDirectory();
    const dist = path.join(root, 'dist');
    const outside = path.join(root, 'outside.txt');
    const link = path.join(dist, 'outside.txt');

    mkdirSync(dist, { recursive: true });
    writeFileSync(outside, 'outside');
    symlinkSync(outside, link);

    const result = spawnSync(process.execPath, [scriptPath, dist], {
      encoding: 'utf8',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'Refusing to materialize symlink outside dist',
    );
    expect(lstatSync(link).isSymbolicLink()).toBe(true);
  });
});

function temporaryDirectory(): string {
  const directory = mkdtempSync(
    path.join(os.tmpdir(), 'nocobase-artifact-materialization-'),
  );
  temporaryDirectories.push(directory);
  return directory;
}
