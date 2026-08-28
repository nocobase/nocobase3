import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ArtifactResolver } from '../server/loader/artifact-resolver.js';
import { buildWorkflowArtifact } from '../server/loader/artifact-builder.js';
import { LocalWorkflowArtifactStore } from '../server/loader/artifact-store.js';
const roots: string[] = [];
afterEach(async () =>
  Promise.all(
    roots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  ),
);
describe('ArtifactResolver', () => {
  it('pins workflow key + hash + script, caches modules, and rejects missing/unsafe entries', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'artifact-resolver-'));
    roots.push(root);
    const definition = {
      title: 'x',
      inputSchema: { type: 'object' as const },
      nodes: [],
    };
    const code = 'exports.run = (args) => ({ version: args.version });';
    const built = buildWorkflowArtifact({
      scanned: { key: 'x', root, entries: [] },
      definition,
      flatIr: { ...definition, start: null, nodes: [] },
      serverEntries: {
        one: {
          source: './server/run.ts',
          output: 'server/run/one.cjs',
          exports: ['run'],
        },
      },
      serverEntryFiles: new Map([['server/run/one.cjs', code]]),
    });
    const stage = path.join(root, 'stage');
    for (const [file, content] of built.files) {
      const target = path.join(stage, file);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, content);
    }
    const store = new LocalWorkflowArtifactStore({
      storeRoot: path.join(root, 'private'),
    });
    await store.commit('x', built.digest, stage);
    const resolver = new ArtifactResolver({ store });
    const request = {
      workflowKey: 'x',
      hash: built.digest,
      nodeKey: 'r',
      sourcePath: './server/run.ts',
    };
    const first = await resolver.resolve(request);
    expect(await resolver.resolve(request)).toBe(first);
    expect(
      await first.run(
        { version: 1 },
        {
          app: null,
          signal: new AbortController().signal,
          logger: { debug() {}, info() {}, warn() {}, error() {} },
        },
      ),
    ).toEqual({ version: 1 });
    await expect(
      resolver.resolve({ ...request, sourcePath: './server/missing.ts' }),
    ).rejects.toThrow(/not present/);
    await expect(resolver.resolve({ ...request, hash: null })).rejects.toThrow(
      /no artifact/,
    );
    await expect(
      resolver.resolve({ ...request, sourcePath: '../x.ts' }),
    ).rejects.toThrow(/unsafe/);
  });
});
