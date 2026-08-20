import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { checkWorkflowPackage, typecheckWorkflowSource, validateWorkflowFlatIrTopology } from '../src/index.js';

const dslPath = fileURLToPath(new URL('../../app-template-default/server/workflows/dsl.ts', import.meta.url));
const temporaryDirectories: string[] = [];

async function sourceFile(body: string): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'nocobase-workflow-check-test-'));
  temporaryDirectories.push(directory);
  const file = path.join(directory, 'workflow.ts');
  await fs.writeFile(file, `import { defineWorkflow, node, trigger } from ${JSON.stringify(dslPath)};\n${body}`);
  return file;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

describe('workflow check', () => {
  it.each([
    ['wrong config value type', `export default defineWorkflow({ title: 'x', trigger: trigger.custom({ config: {} }), nodes: [node.run({ key: 'run', config: { script: 1 } })] });`, 'TS2322'],
    ['wrong branch name', `export default defineWorkflow({ title: 'x', trigger: trigger.custom({ config: {} }), nodes: [node.condition({ key: 'c', config: {} }).branch({ maybe: [] })] });`, 'TS2353'],
    ['branch on non-branch node', `export default defineWorkflow({ title: 'x', trigger: trigger.custom({ config: {} }), nodes: [node.run({ key: 'run', config: { script: './x.ts' } }).branch({})] });`, 'TS2339'],
    ['unaggregated node type', `export default defineWorkflow({ title: 'x', trigger: trigger.custom({ config: {} }), nodes: [node.approval({ key: 'a', config: {} })] });`, 'TS2339'],
  ])('rejects %s during typecheck', async (_name, body, code) => {
    const file = await sourceFile(body);
    expect(typecheckWorkflowSource(file).map((issue) => issue.code)).toContain(code);
  });

  it('runs typecheck, bundle, evaluate, schema, semantic, and compile without writing a database', async () => {
    const file = await sourceFile(`export default defineWorkflow({ title: 'x', trigger: trigger.custom({ config: {} }), nodes: [node.condition({ key: 'c', config: {} }).branch({ yes: [node.run({ key: 'inside', config: { script: './inside.ts' } })] }), node.run({ key: 'after', config: { script: './after.ts' } })] });`);
    await expect(checkWorkflowPackage(file)).resolves.toMatchObject({ ir: { start: 'c', nodes: [{ key: 'c' }, { key: 'inside' }, { key: 'after' }] } });
  });

  it.each([
    ['missing owner', [{ key: 'start', type: 'run', config: {}, upstreamKey: null, downstreamKey: null, branchKey: null }, { key: 'orphan', type: 'run', config: {}, upstreamKey: null, downstreamKey: null, branchKey: null }], /no upstream owner/],
    ['self-cycle', [{ key: 'start', type: 'run', config: {}, upstreamKey: null, downstreamKey: 'start', branchKey: null }], /cannot reference itself/],
    ['missing target', [{ key: 'start', type: 'run', config: {}, upstreamKey: null, downstreamKey: 'missing', branchKey: null }], /references missing node/],
  ])('preserves the flat topology invariant for %s', (_name, nodes, message) => {
    expect(() => validateWorkflowFlatIrTopology({ title: 'bad', trigger: { type: 'custom', config: {} }, start: 'start', nodes })).toThrow(message);
  });
});
