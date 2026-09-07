import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { DatabaseManager } from '@nocobase/db';
import {
  createServiceToken,
  ServiceContainer,
} from '@nocobase/service-provider';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  EXECUTION_STATUS,
  NODE_RUN_STATUS,
} from '../server/engine/constants.js';
import Dispatcher from '../server/engine/dispatcher.js';
import type { WorkflowInstructionClass } from '../server/instructions/base.js';
import {
  assertWorkflowRunResult,
  RunInstruction,
  validateRunConfig,
} from '../server/instructions/run/instruction.js';
import { buildWorkflowArtifact } from '../build/artifact-builder.js';
import { LocalWorkflowArtifactStore } from '../server/loader/artifact-store.js';
import { pendingInstruction } from './fixtures/instructions.js';
import { createWorkflowRunServices } from '../server/engine/run-services.js';
import {
  createTestDatabase,
  createTestWorkflow,
  findRun,
  listNodeRuns,
} from './helpers.js';

const SOURCE_ROOT = fileURLToPath(
  new URL('./fixtures/run-scripts', import.meta.url),
);
const OUTSIDE_ROOT = fileURLToPath(
  new URL('./fixtures/outside', import.meta.url),
);
const container = new ServiceContainer();
const services = createWorkflowRunServices(container);
const roots: string[] = [];

function runInstructions(): Map<string, WorkflowInstructionClass> {
  return new Map<string, WorkflowInstructionClass>([['run', RunInstruction]]);
}

async function createArtifactRoot(
  modules: Readonly<Record<string, string>>,
): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'run-resource-'));
  roots.push(root);
  for (const [specifier, code] of Object.entries(modules)) {
    const target = path.join(root, `${specifier}.js`);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, code);
  }
  await fs.writeFile(path.join(root, 'package.json'), '{"type":"module"}');
  return root;
}

describe('run instruction', () => {
  let database: DatabaseManager;

  beforeEach(async () => {
    database = await createTestDatabase();
  });

  afterEach(async () => {
    await database.destroy();
    await Promise.all(
      roots
        .splice(0)
        .map((root) => fs.rm(root, { recursive: true, force: true })),
    );
  });

  async function runSingleNode(
    key: string,
    config: Record<string, unknown>,
    modules: Readonly<Record<string, string>>,
    context: unknown = {},
  ): Promise<{
    status: unknown;
    nodeRuns: Awaited<ReturnType<typeof listNodeRuns>>;
  }> {
    const resourceRoot = await createArtifactRoot(modules);
    const workflow = await createTestWorkflow(database, {
      key,
      nodes: [{ key: 'run', type: 'run', config }],
    });
    const dispatcher = new Dispatcher({
      database,
      instructions: runInstructions(),
      resolveWorkflowResourceRoot: () => Promise.resolve(resourceRoot),
      services,
    });
    await dispatcher.trigger(workflow, context, {
      eventKey: key,
      manually: true,
    });
    const execution = await findRun(database, key);
    return {
      status: execution.status,
      nodeRuns: await listNodeRuns(database, execution.id as number),
    };
  }

  it('resumes a historical run from the artifact pinned on its execution', async () => {
    const artifactRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), 'run-pin-artifact-'),
    );
    roots.push(artifactRoot);
    const store = new LocalWorkflowArtifactStore({
      storeRoot: path.join(artifactRoot, 'private'),
    });
    const makeArtifact = async (version: 'v1' | 'v2'): Promise<string> => {
      const definition = {
        title: version,
        inputSchema: { type: 'object' as const },
        nodes: [],
      };
      const built = buildWorkflowArtifact({
        key: 'pin-artifact',
        flatIr: { ...definition, start: null, nodes: [] },
        resourceFiles: new Map([
          [
            'server/run.js',
            `export function run(){ return ${JSON.stringify(version)}; }`,
          ],
        ]),
      });
      const stage = path.join(artifactRoot, `stage-${version}`);
      for (const [file, content] of built.files) {
        const target = path.join(stage, file);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, content);
      }
      await store.commit('pin-artifact', built.digest, stage);
      return built.digest;
    };
    const [v1Hash, v2Hash] = await Promise.all([
      makeArtifact('v1'),
      makeArtifact('v2'),
    ]);
    const workflow = await createTestWorkflow(database, {
      key: 'pin-artifact',
      nodes: [
        { key: 'hold', type: 'pending', downstreamKey: 'run' },
        {
          key: 'run',
          type: 'run',
          config: { module: './server/run' },
          upstreamKey: 'hold',
        },
      ],
    });
    await database
      .query()
      .updateTable('workflows')
      .set({ hash: v1Hash })
      .where('id', '=', workflow.id)
      .execute();
    workflow.hash = v1Hash;
    const dispatcher = new Dispatcher({
      database,
      instructions: new Map<string, WorkflowInstructionClass>([
        ['pending', pendingInstruction],
        ['run', RunInstruction],
      ]),
      resolveWorkflowResourceRoot: (_workflow, execution) =>
        execution.hash
          ? store.materialize(execution.workflowKey, execution.hash)
          : Promise.resolve(null),
      services,
    });

    await dispatcher.trigger(
      workflow,
      {},
      { eventKey: 'pinned', manually: true },
    );
    const execution = await findRun(database, 'pinned');
    const pending = await database
      .query()
      .selectFrom('workflowNodeRuns')
      .select(['id'])
      .where('workflowRunId', '=', execution.id)
      .where('nodeKey', '=', 'hold')
      .executeTakeFirstOrThrow();
    await database
      .query()
      .updateTable('workflows')
      .set({ hash: v2Hash })
      .where('id', '=', workflow.id)
      .execute();
    await dispatcher.dispatch({
      executionId: execution.id,
      nodeRunId: pending.id as number,
    });

    await expect(
      listNodeRuns(database, execution.id as number),
    ).resolves.toEqual([
      { nodeKey: 'hold', status: NODE_RUN_STATUS.RESOLVED, result: null },
      { nodeKey: 'run', status: NODE_RUN_STATUS.RESOLVED, result: 'v1' },
    ]);
  });

  it('resolves args and stores JSON-compatible results', async () => {
    const { status, nodeRuns } = await runSingleNode(
      'args',
      {
        module: './server/record-step',
        args: { orderId: '{{$input.order.id}}' },
      },
      {
        './server/record-step':
          'export const run = (args) => ({ orderId: args.orderId, values: [1, null, false] });',
      },
      { order: { id: 7 } },
    );
    expect(status).toBe(EXECUTION_STATUS.RESOLVED);
    expect(nodeRuns[0]).toMatchObject({
      status: NODE_RUN_STATUS.RESOLVED,
      result: { orderId: 7, values: [1, null, false] },
    });
  });

  it('normalizes undefined and rejects non-JSON results', async () => {
    const empty = await runSingleNode(
      'undefined-result',
      { module: './empty' },
      { './empty': 'export const run = () => undefined;' },
    );
    expect(empty.nodeRuns[0].result).toBeNull();

    const invalid = await runSingleNode(
      'invalid-result',
      { module: './invalid' },
      { './invalid': 'export const run = () => ({ total: 10n });' },
    );
    expect(invalid.status).toBe(EXECUTION_STATUS.ERROR);
    expect(invalid.nodeRuns[0].error).toMatch(/BigInt/);
  });

  it('passes services, signal, and contextual logger in frozen options', async () => {
    const { nodeRuns } = await runSingleNode(
      'services',
      { module: './services' },
      {
        './services':
          'export const run = (_args, options) => ({ keys: Object.keys(options).sort(), frozen: Object.isFrozen(options), serviceKeys: Object.keys(options.services).sort(), servicesFrozen: Object.isFrozen(options.services), signal: options.signal instanceof AbortSignal, logger: typeof options.logger.info });',
      },
    );
    expect(nodeRuns[0].result).toEqual({
      keys: ['logger', 'services', 'signal'],
      frozen: true,
      serviceKeys: ['has', 'resolve'],
      servicesFrozen: true,
      signal: true,
      logger: 'function',
    });
  });

  it('resolves application services by their original tokens', () => {
    const token = createServiceToken<{ readonly value: string }>(
      '@nocobase/app-plugin-workflow/tests/service',
    );
    const bound = { value: 'resolved' };
    const testContainer = new ServiceContainer();
    testContainer.instance(token, bound);

    const runServices = createWorkflowRunServices(testContainer);

    expect(runServices.has(token)).toBe(true);
    expect(runServices.resolve(token)).toBe(bound);
    expect(runServices).not.toHaveProperty('instance');
    expect(runServices).not.toHaveProperty('singleton');
  });

  it('lets a run stop in-flight work through the Workflow abort signal', async () => {
    const resourceRoot = await createArtifactRoot({
      './slow':
        'export const run = (_args, options) => new Promise((resolve, reject) => { options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true }); setTimeout(resolve, 2000); });',
    });
    const workflow = await createTestWorkflow(database, {
      key: 'aborted',
      options: { timeout: 0.05 },
      nodes: [{ key: 'run', type: 'run', config: { module: './slow' } }],
    });
    const dispatcher = new Dispatcher({
      database,
      instructions: runInstructions(),
      resolveWorkflowResourceRoot: () => Promise.resolve(resourceRoot),
      services,
    });
    await dispatcher.trigger(
      workflow,
      {},
      { eventKey: 'aborted', manually: true },
    );
    expect((await findRun(database, 'aborted')).status).toBe(
      EXECUTION_STATUS.ABORTED,
    );
  });

  it('logs metadata without args or result values', async () => {
    const resourceRoot = await createArtifactRoot({
      './safe': 'export const run = () => ({ confidential: "result" });',
    });
    const workflow = await createTestWorkflow(database, {
      key: 'safe-log',
      nodes: [
        {
          key: 'run',
          type: 'run',
          config: { module: './safe', args: { secret: 'hidden' } },
        },
      ],
    });
    const info = vi.fn();
    const dispatcher = new Dispatcher({
      database,
      instructions: runInstructions(),
      resolveWorkflowResourceRoot: () => Promise.resolve(resourceRoot),
      services,
      logger: { debug: vi.fn(), info, warn: vi.fn(), error: vi.fn() },
    });
    await dispatcher.trigger(
      workflow,
      {},
      { eventKey: 'safe-log', manually: true },
    );
    const serialized = JSON.stringify(info.mock.calls);
    expect(serialized).toContain('durationMs');
    expect(serialized).not.toContain('hidden');
    expect(serialized).not.toContain('confidential');
  });

  it('loads an extensionless module from an explicit source root', async () => {
    const workflow = await createTestWorkflow(database, {
      key: 'source',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'number' } },
      },
      nodes: [
        {
          key: 'run',
          type: 'run',
          config: { module: './echo-args', args: { id: '{{$input.id}}' } },
        },
      ],
    });
    const dispatcher = new Dispatcher({
      database,
      instructions: runInstructions(),
      resolveWorkflowResourceRoot: () => Promise.resolve(SOURCE_ROOT),
      services,
    });
    await dispatcher.trigger(
      workflow,
      { id: 1 },
      { eventKey: 'source', manually: true },
    );
    const execution = await findRun(database, 'source');
    expect(
      (await listNodeRuns(database, execution.id as number))[0].result,
    ).toEqual({
      received: { id: 1 },
    });
  });

  it('rejects a source symlink that escapes the workflow root', async () => {
    const link = path.join(SOURCE_ROOT, 'escaped.mjs');
    await fs.rm(link, { force: true });
    await fs.symlink(path.join(OUTSIDE_ROOT, 'secret.mjs'), link);
    try {
      const workflow = await createTestWorkflow(database, {
        key: 'escaped',
        nodes: [{ key: 'run', type: 'run', config: { module: './escaped' } }],
      });
      const dispatcher = new Dispatcher({
        database,
        instructions: runInstructions(),
        resolveWorkflowResourceRoot: () => Promise.resolve(SOURCE_ROOT),
      });
      await dispatcher.trigger(
        workflow,
        {},
        { eventKey: 'escaped', manually: true },
      );
      expect((await findRun(database, 'escaped')).status).toBe(
        EXECUTION_STATUS.ERROR,
      );
    } finally {
      await fs.rm(link, { force: true });
    }
  });

  it('fails clearly without a resource root', async () => {
    const workflow = await createTestWorkflow(database, {
      key: 'unbound',
      nodes: [{ key: 'run', type: 'run', config: { module: './missing' } }],
    });
    const dispatcher = new Dispatcher({
      database,
      instructions: runInstructions(),
    });
    await dispatcher.trigger(
      workflow,
      {},
      { eventKey: 'unbound', manually: true },
    );
    const execution = await findRun(database, 'unbound');
    expect(execution.status).toBe(EXECUTION_STATUS.ERROR);
    expect(
      (await listNodeRuns(database, execution.id as number))[0].error,
    ).toMatch(/no workflow resource root/);
  });

  it('cannot suspend', () => {
    expect(RunInstruction.prototype.resume).toBeUndefined();
  });
});

describe('validateRunConfig', () => {
  it('accepts an extensionless relative module and object args', () => {
    expect(
      validateRunConfig({
        module: './server/record-step',
        args: { id: '{{$input.id}}' },
      }),
    ).toBeNull();
  });

  it('rejects missing, templated, unsafe, and extension-bearing modules', () => {
    expect(validateRunConfig({})).toMatchObject({ module: expect.any(String) });
    for (const module of [
      './server/{{$parameters.name}}',
      '../outside',
      './server/file.ts',
      'server/bare',
      './server/../outside',
    ]) {
      expect(validateRunConfig({ module })).toMatchObject({
        module: expect.any(String),
      });
    }
    expect(validateRunConfig({ module: './valid', args: [] })).toMatchObject({
      args: expect.any(String),
    });
  });
});

describe('assertWorkflowRunResult', () => {
  it('accepts JSON values and repeated non-circular references', () => {
    const shared = { id: 1 };
    expect(() =>
      assertWorkflowRunResult({
        values: [1, null, false],
        left: shared,
        right: shared,
      }),
    ).not.toThrow();
  });
});
