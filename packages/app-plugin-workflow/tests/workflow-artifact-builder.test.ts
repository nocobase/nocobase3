import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildWorkflowArtifact,
  computeWorkflowArtifactDigest,
} from '../server/loader/artifact-builder.js';

const roots: string[] = [];
afterEach(async () =>
  Promise.all(
    roots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  ),
);
const definition = {
  title: 'x',
  contextSchema: { type: 'object' as const },
  nodes: [],
};
const flatIr = { ...definition, start: null, nodes: [] };

describe('workflow Artifact', () => {
  it('hashes only canonical workflow.json and server/client bytes, independent of host path and mtime', async () => {
    const first = buildWorkflowArtifact({
      scanned: { key: 'stable', root: '/host/a', entries: [] },
      definition,
      flatIr,
    });
    const second = buildWorkflowArtifact({
      scanned: { key: 'stable', root: '/other/host', entries: [] },
      definition,
      flatIr,
    });
    expect(second.digest).toBe(first.digest);
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'artifact-mtime-'));
    roots.push(root);
    const file = path.join(root, 'workflow.json');
    await fs.writeFile(file, first.files.get('workflow.json')!);
    await fs.utimes(file, new Date(0), new Date());
    expect(
      computeWorkflowArtifactDigest([
        { path: 'workflow.json', content: await fs.readFile(file) },
      ]),
    ).toBe(first.digest);
  });
  it('changes for Flat IR or any emitted server bytes and has one structured contract', () => {
    const base = buildWorkflowArtifact({
      scanned: { key: 'x', root: '/x', entries: [] },
      definition,
      flatIr,
    });
    const changedIr = buildWorkflowArtifact({
      scanned: { key: 'x', root: '/x', entries: [] },
      definition,
      flatIr: { ...flatIr, title: 'y' },
    });
    const changedServer = buildWorkflowArtifact({
      scanned: { key: 'x', root: '/x', entries: [] },
      definition,
      flatIr,
      serverEntries: {
        one: {
          source: './server/run.ts',
          output: 'server/run/one.cjs',
          exports: ['run'],
        },
      },
      serverEntryFiles: new Map([['server/run/one.cjs', 'exports.run=()=>1']]),
    });
    expect(changedIr.digest).not.toBe(base.digest);
    expect(changedServer.digest).not.toBe(base.digest);
    expect([...changedServer.files.keys()].sort()).toEqual([
      'server/run/one.cjs',
      'workflow.json',
    ]);
    expect(changedServer.files.has('artifact-manifest.json')).toBe(false);
  });
  it('preserves effective node result schemas in workflow.json', () => {
    const withResult = {
      ...flatIr,
      start: 'value',
      nodes: [
        {
          key: 'value',
          type: 'run',
          config: {},
          result: { type: 'string' as const },
          upstreamKey: null,
          downstreamKey: null,
          branchKey: null,
        },
      ],
    };
    const built = buildWorkflowArtifact({
      scanned: { key: 'x', root: '/x', entries: [] },
      definition,
      flatIr: withResult,
    });
    expect(built.workflow.nodes[0].result).toEqual({ type: 'string' });
    expect(
      JSON.parse(built.files.get('workflow.json')!).nodes[0].result,
    ).toEqual({ type: 'string' });
  });
});
