import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildWorkflowArtifact,
  LocalWorkflowArtifactStore,
} from '../engine/index.js';
const roots: string[] = [];
afterEach(async () =>
  Promise.all(
    roots
      .splice(0)
      .map((value) => fs.rm(value, { recursive: true, force: true })),
  ),
);
async function artifact(
  base: string,
): Promise<{ source: string; digest: string }> {
  const source = path.join(base, 'source');
  const definition = {
    title: 'x',
    contextSchema: { type: 'object' as const },
    nodes: [],
  };
  const built = buildWorkflowArtifact({
    scanned: { key: 'x', root: base, entries: [] },
    definition,
    flatIr: { ...definition, start: null, nodes: [] },
    serverEntries: {
      one: {
        source: './run.ts',
        output: 'server/run/one.cjs',
        exports: ['run'],
      },
    },
    serverEntryFiles: new Map([['server/run/one.cjs', 'exports.run=()=>1']]),
  });
  for (const [file, content] of built.files) {
    const target = path.join(source, file);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content);
  }
  return { source, digest: built.digest };
}
describe('local workflow Artifact Store', () => {
  it('commits to workflows/key/digest and reuses a verified immutable directory', async () => {
    const base = await fs.mkdtemp(path.join(os.tmpdir(), 'artifact-store-'));
    roots.push(base);
    const built = await artifact(base);
    const store = new LocalWorkflowArtifactStore({
      storeRoot: path.join(base, 'private'),
    });
    await store.commit('x', built.digest, built.source);
    await store.commit('x', built.digest, built.source);
    expect(await store.materialize('x', built.digest)).toBe(
      path.join(base, 'private/workflows/x', built.digest),
    );
    await expect(store.readWorkflow('x', built.digest)).resolves.toMatchObject({
      key: 'x',
      formatVersion: 1,
    });
  });
  it('rejects tampering without exposing a formal digest directory', async () => {
    const base = await fs.mkdtemp(path.join(os.tmpdir(), 'artifact-store-'));
    roots.push(base);
    const built = await artifact(base);
    await fs.writeFile(
      path.join(built.source, 'server/run/one.cjs'),
      'tampered',
    );
    const store = new LocalWorkflowArtifactStore({
      storeRoot: path.join(base, 'private'),
    });
    await expect(store.commit('x', built.digest, built.source)).rejects.toThrow(
      /content address/,
    );
    await expect(store.has('x', built.digest)).resolves.toBe(false);
  });
});
