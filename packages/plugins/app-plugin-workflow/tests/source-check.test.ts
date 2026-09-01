import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { checkWorkflowPackage } from '../build/index.js';
import { validateWorkflowFlatIrTopology } from '../server/loader/source-compiler.js';
import { typecheckWorkflowSource } from '../server/loader/source-parser.js';

const authoringEntry = fileURLToPath(new URL('../index.ts', import.meta.url));
const temporaryDirectories: string[] = [];

async function sourceFile(body: string): Promise<string> {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'nocobase-workflow-check-test-'),
  );
  temporaryDirectories.push(directory);
  const file = path.join(directory, 'workflow.ts');
  await fs.writeFile(
    file,
    `import { ConditionInstruction, defineWorkflow, RunInstruction } from ${JSON.stringify(authoringEntry)};\n${body}`,
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
      `export default defineWorkflow({ title: 'x', nodes: [RunInstruction.create({ key: 'run', config: { module: 1 } })] });`,
      'TS2322',
    ],
    [
      'wrong branch name',
      `export default defineWorkflow({ title: 'x', nodes: [ConditionInstruction.create({ key: 'c', config: {} }).branch({ maybe: [] })] });`,
      'TS2353',
    ],
    [
      'branch on non-branch node',
      `export default defineWorkflow({ title: 'x', nodes: [RunInstruction.create({ key: 'run', config: { module: './x' } }).branch({})] });`,
      'TS2339',
    ],
    [
      'unknown instruction export',
      `export default defineWorkflow({ title: 'x', nodes: [ApprovalInstruction.create({ key: 'a', config: {} })] });`,
      'TS2304',
    ],
    [
      'unknown condition operator',
      `export default defineWorkflow({ title: 'x', nodes: [ConditionInstruction.create({ key: 'c', config: { expression: { execute: ['process.exit()'] } } })] });`,
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
      `export default defineWorkflow({ title: 'x', nodes: [ConditionInstruction.create({ key: 'c', config: {} }).branch({ yes: [RunInstruction.create({ key: 'inside', config: { module: './inside' } })] }), RunInstruction.create({ key: 'after', config: { module: './after' } })] });`,
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
      `export default defineWorkflow({ title: 'x', nodes: [ConditionInstruction.create({ key: 'c', config: { expression: { var: 'input.constructor.secret' } } })] });`,
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
      `export default defineWorkflow({ title: 'x', inputSchema: { type: 'object', required: ['active'], properties: { active: { type: 'boolean' } }, additionalProperties: false }, nodes: [] });`,
    );
    await expect(checkWorkflowPackage(file)).resolves.toMatchObject({
      ast: { inputSchema: { type: 'object', required: ['active'] } },
      ir: { inputSchema: { type: 'object', required: ['active'] } },
    });
  });

  it('reports unsupported context schema capabilities with a structured path', async () => {
    const file = await sourceFile(
      `export default defineWorkflow({ title: 'x', inputSchema: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } }, nodes: [] });`,
    );
    await expect(checkWorkflowPackage(file)).rejects.toMatchObject({
      issues: [
        expect.objectContaining({
          code: 'INVALID_INPUT_SCHEMA',
          astPath: 'workflow.inputSchema.properties.id.format',
          contractType: 'WorkflowInputSchema',
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
          inputSchema: { type: 'object' },
          start: 'start',
          nodes,
        }),
      ).toThrow(message);
    },
  );
});
