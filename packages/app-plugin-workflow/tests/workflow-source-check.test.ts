import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import {
  checkWorkflowPackage,
  typecheckWorkflowSource,
  validateWorkflowFlatIrTopology,
} from '../engine/index.js';

const dslPath = fileURLToPath(
  new URL(
    '../../app-template-default/server/workflows/dsl.ts',
    import.meta.url,
  ),
);
const temporaryDirectories: string[] = [];

async function sourceFile(body: string): Promise<string> {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'nocobase-workflow-check-test-'),
  );
  temporaryDirectories.push(directory);
  const file = path.join(directory, 'workflow.ts');
  await fs.writeFile(
    file,
    `import { defineWorkflow, node } from ${JSON.stringify(dslPath)};\n${body}`,
  );
  return file;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

describe('workflow check', () => {
  it.each([
    [
      'wrong config value type',
      `export default defineWorkflow({ title: 'x', nodes: [node.run({ key: 'run', config: { script: 1 } })] });`,
      'TS2322',
    ],
    [
      'wrong branch name',
      `export default defineWorkflow({ title: 'x', nodes: [node.condition({ key: 'c', config: {} }).branch({ maybe: [] })] });`,
      'TS2353',
    ],
    [
      'branch on non-branch node',
      `export default defineWorkflow({ title: 'x', nodes: [node.run({ key: 'run', config: { script: './x.ts' } }).branch({})] });`,
      'TS2339',
    ],
    [
      'unaggregated node type',
      `export default defineWorkflow({ title: 'x', nodes: [node.approval({ key: 'a', config: {} })] });`,
      'TS2339',
    ],
    [
      'unknown condition operator',
      `export default defineWorkflow({ title: 'x', nodes: [node.condition({ key: 'c', config: { expression: { execute: ['process.exit()'] } } })] });`,
      'TS2353',
    ],
  ])('rejects %s during typecheck', async (_name, body, code) => {
    const file = await sourceFile(body);
    expect(typecheckWorkflowSource(file).map((issue) => issue.code)).toContain(
      code,
    );
  });

  it('runs typecheck, bundle, evaluate, schema, semantic, and compile without writing a database', async () => {
    const file = await sourceFile(
      `export default defineWorkflow({ title: 'x', nodes: [node.condition({ key: 'c', config: {} }).branch({ yes: [node.run({ key: 'inside', config: { script: './inside.ts' } })] }), node.run({ key: 'after', config: { script: './after.ts' } })] });`,
    );
    await expect(checkWorkflowPackage(file)).resolves.toMatchObject({
      ir: {
        start: 'c',
        nodes: [{ key: 'c' }, { key: 'inside' }, { key: 'after' }],
      },
    });
  });

  it('reports a JSON Logic validation error at the expression path', async () => {
    const file = await sourceFile(
      `export default defineWorkflow({ title: 'x', nodes: [node.condition({ key: 'c', config: { expression: { var: 'context.constructor.secret' } } })] });`,
    );
    await expect(checkWorkflowPackage(file)).rejects.toMatchObject({
      issues: [
        expect.objectContaining({
          phase: 'schema',
          code: 'INVALID_NODE_CONFIG',
          astPath: expect.stringContaining('config.expression.var'),
          nodeKey: 'c',
        }),
      ],
    });
  });

  it('checks a trigger-free definition and exposes the same context schema in AST and flat IR', async () => {
    const file = await sourceFile(
      `export default defineWorkflow({ title: 'x', contextSchema: { type: 'object', required: ['active'], properties: { active: { type: 'boolean' } }, additionalProperties: false }, nodes: [] });`,
    );
    await expect(checkWorkflowPackage(file)).resolves.toMatchObject({
      ast: { contextSchema: { type: 'object', required: ['active'] } },
      ir: { contextSchema: { type: 'object', required: ['active'] } },
    });
  });

  it('reports unsupported context schema capabilities with a structured path', async () => {
    const file = await sourceFile(
      `export default defineWorkflow({ title: 'x', contextSchema: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } }, nodes: [] });`,
    );
    await expect(checkWorkflowPackage(file)).rejects.toMatchObject({
      issues: [
        expect.objectContaining({
          code: 'INVALID_CONTEXT_SCHEMA',
          astPath: 'workflow.contextSchema.properties.id.format',
          contractType: 'ContextSchema',
        }),
      ],
    });
  });

  it.each([
    [
      'missing owner',
      [
        {
          key: 'start',
          type: 'run',
          config: {},
          upstreamKey: null,
          downstreamKey: null,
          branchKey: null,
        },
        {
          key: 'orphan',
          type: 'run',
          config: {},
          upstreamKey: null,
          downstreamKey: null,
          branchKey: null,
        },
      ],
      /no upstream owner/,
    ],
    [
      'self-cycle',
      [
        {
          key: 'start',
          type: 'run',
          config: {},
          upstreamKey: null,
          downstreamKey: 'start',
          branchKey: null,
        },
      ],
      /cannot reference itself/,
    ],
    [
      'missing target',
      [
        {
          key: 'start',
          type: 'run',
          config: {},
          upstreamKey: null,
          downstreamKey: 'missing',
          branchKey: null,
        },
      ],
      /references missing node/,
    ],
  ])(
    'preserves the flat topology invariant for %s',
    (_name, nodes, message) => {
      expect(() =>
        validateWorkflowFlatIrTopology({
          title: 'bad',
          contextSchema: { type: 'object' },
          start: 'start',
          nodes,
        }),
      ).toThrow(message);
    },
  );
});
