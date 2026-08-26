import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

import type { DatabaseManager } from '@nocobase/database';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  EXECUTION_STATUS,
  NODE_RUN_STATUS,
} from '../server/engine/constants.js';
import Dispatcher from '../server/engine/dispatcher.js';
import type { WorkflowInstructionClass } from '../server/instructions/base.js';
import {
  assertWorkflowRunResult,
  createRunInstruction,
  validateRunConfig,
  WorkflowRunModuleError,
  type WorkflowRunModule,
  type WorkflowRunModuleRequest,
  type WorkflowRunModuleResolver,
  type WorkflowRunRuntime,
} from '../server/instructions/run/instruction.js';
import { ArtifactResolver } from '../server/loader/artifact-resolver.js';
import { buildWorkflowArtifact } from '../server/loader/artifact-builder.js';
import { LocalWorkflowArtifactStore } from '../server/loader/artifact-store.js';
import {
  createSourceDirResolver,
  unboundRunModuleResolver,
} from '../server/loader/module-resolver.js';
import { pendingInstruction } from './fixtures/instructions.js';
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

const app = { name: 'test-app' };

type ScriptRun = (args: unknown, runtime: WorkflowRunRuntime) => unknown;

/** A resolver backed by an in-memory table, so the tests stay independent of module loading. */
function stubResolver(
  modules: Record<string, ScriptRun>,
): WorkflowRunModuleResolver {
  return {
    async resolve(
      request: WorkflowRunModuleRequest,
    ): Promise<WorkflowRunModule> {
      const run = modules[request.sourcePath];
      if (!run) {
        throw new WorkflowRunModuleError(
          `Unknown script "${request.sourcePath}"`,
        );
      }
      return { run };
    },
  };
}

function instructionsWith(
  resolver: WorkflowRunModuleResolver,
): Map<string, WorkflowInstructionClass> {
  return new Map<string, WorkflowInstructionClass>([
    ['run', createRunInstruction({ resolver, app })],
  ]);
}

describe('run instruction', () => {
  let database: DatabaseManager;

  beforeEach(async () => {
    database = await createTestDatabase();
  });

  afterEach(async () => {
    await database.destroy();
  });

  async function runSingleNode(
    key: string,
    config: Record<string, unknown>,
    resolver: WorkflowRunModuleResolver,
    context: unknown = {},
  ): Promise<{
    status: unknown;
    nodeRuns: Awaited<ReturnType<typeof listNodeRuns>>;
  }> {
    const workflow = await createTestWorkflow(database, {
      key,
      nodes: [{ key: 'script', type: 'run', config }],
    });
    const dispatcher = new Dispatcher({
      database,
      instructions: instructionsWith(resolver),
    });
    await dispatcher.trigger(workflow, context, {
      eventKey: key,
      manually: true,
    });
    const run = await findRun(database, key);
    return {
      status: run.status,
      nodeRuns: await listNodeRuns(database, run.id as number),
    };
  }

  it('resumes a pending historical run with its pinned artifact after the workflow revision changes', async () => {
    const artifactRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), 'run-pin-artifact-'),
    );
    const store = new LocalWorkflowArtifactStore({
      storeRoot: path.join(artifactRoot, 'private'),
    });
    const makeArtifact = async (version: 'v1' | 'v2'): Promise<string> => {
      const code = `exports.run = () => ${JSON.stringify(version)};`;
      const definition = {
        title: version,
        contextSchema: { type: 'object' as const },
        nodes: [],
      };
      const built = buildWorkflowArtifact({
        scanned: { key: 'pin-artifact', root: artifactRoot, entries: [] },
        definition,
        flatIr: { ...definition, start: null, nodes: [] },
        serverEntries: {
          entry: {
            source: './server/run.ts',
            output: 'server/run/run.cjs',
            exports: ['run'],
          },
        },
        serverEntryFiles: new Map([['server/run/run.cjs', code]]),
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
        { key: 'hold', type: 'pending', downstreamKey: 'script' },
        {
          key: 'script',
          type: 'run',
          config: { script: './server/run.ts' },
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
    const resolver = new ArtifactResolver({ store });
    const dispatcher = new Dispatcher({
      database,
      instructions: new Map<string, WorkflowInstructionClass>([
        ['pending', pendingInstruction],
        ['run', createRunInstruction({ resolver, app })],
      ]),
    });

    await dispatcher.trigger(
      workflow,
      {},
      { eventKey: 'historical', manually: true },
    );
    const run = await findRun(database, 'historical');
    expect(run.hash).toBe(v1Hash);
    const runId = run.id as number;
    const pendingNodeRun = await database
      .query()
      .selectFrom('workflowNodeRuns')
      .select(['id'])
      .where('workflowRunId', '=', runId)
      .where('nodeKey', '=', 'hold')
      .executeTakeFirstOrThrow();
    await expect(listNodeRuns(database, runId)).resolves.toEqual([
      { nodeKey: 'hold', status: NODE_RUN_STATUS.PENDING, result: null },
    ]);

    await database
      .query()
      .updateTable('workflows')
      .set({ hash: v2Hash })
      .where('id', '=', workflow.id)
      .execute();
    await dispatcher.dispatch({
      executionId: runId,
      nodeRunId: pendingNodeRun.id as number,
    });

    await expect(listNodeRuns(database, runId)).resolves.toEqual([
      { nodeKey: 'hold', status: NODE_RUN_STATUS.RESOLVED, result: null },
      { nodeKey: 'script', status: NODE_RUN_STATUS.RESOLVED, result: 'v1' },
    ]);
    await fs
      .rm(artifactRoot, { recursive: true, force: true })
      .catch(() => undefined);
  });

  it('emits fixed execution metadata without args or result values', async () => {
    const workflow = await createTestWorkflow(database, {
      key: 'safe-log',
      nodes: [
        {
          key: 'script',
          type: 'run',
          config: { script: './run', args: { secret: 'hidden' } },
        },
      ],
    });
    const info = vi.fn();
    const dispatcher = new Dispatcher({
      database,
      instructions: instructionsWith(
        stubResolver({ './run': () => ({ confidential: 'result' }) }),
      ),
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

  // §11.2 (1)
  it('resolves args from $context, $input and earlier nodeRun results', async () => {
    const seen: unknown[] = [];
    const workflow = await createTestWorkflow(database, {
      key: 'args',
      nodes: [
        {
          key: 'first',
          type: 'run',
          config: { script: './first' },
          downstreamKey: 'second',
        },
        {
          key: 'second',
          type: 'run',
          config: {
            script: './second',
            args: {
              orderId: '{{$context.order.id}}',
              previous: '{{$nodeResults.first.total}}',
              label: 'order-{{$context.order.id}}',
            },
          },
          upstreamKey: 'first',
        },
      ],
    });
    const resolver = stubResolver({
      './first': () => ({ total: 42 }),
      './second': (args) => {
        seen.push(args);
        return 'done';
      },
    });
    const dispatcher = new Dispatcher({
      database,
      instructions: instructionsWith(resolver),
    });
    await dispatcher.trigger(
      workflow,
      { order: { id: 7 } },
      { eventKey: 'args', manually: true },
    );

    expect(seen).toEqual([{ orderId: 7, previous: 42, label: 'order-7' }]);
    expect((await findRun(database, 'args')).status).toBe(
      EXECUTION_STATUS.RESOLVED,
    );
  });

  // §11.2 (2)
  it('stores objects, arrays, scalars and null as a RESOLVED nodeRun', async () => {
    for (const [index, value] of [
      { ok: true },
      [1, 2, 3],
      'text',
      0,
      false,
      null,
    ].entries()) {
      const { status, nodeRuns } = await runSingleNode(
        `plain-${index}`,
        { script: './value' },
        stubResolver({ './value': () => value }),
      );
      expect(status).toBe(EXECUTION_STATUS.RESOLVED);
      expect(nodeRuns).toEqual([
        { nodeKey: 'script', status: NODE_RUN_STATUS.RESOLVED, result: value },
      ]);
    }
  });

  // §11.2 (3)
  it('normalizes undefined to null instead of exiting silently', async () => {
    const { status, nodeRuns } = await runSingleNode(
      'undefined-result',
      { script: './nothing' },
      stubResolver({ './nothing': () => undefined }),
    );
    expect(status).toBe(EXECUTION_STATUS.RESOLVED);
    expect(nodeRuns).toEqual([
      { nodeKey: 'script', status: NODE_RUN_STATUS.RESOLVED, result: null },
    ]);
  });

  // §11.2 (4)
  it('turns an unstorable result into a clear ERROR', async () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    class FakeModel {
      id = 1;
    }
    const cases: [string, () => unknown, RegExp][] = [
      ['circular', () => circular, /circular reference/],
      ['bigint', () => ({ total: 10n }), /BigInt/],
      ['function', () => ({ callback: () => 1 }), /function/],
      ['symbol', () => ({ tag: Symbol('x') }), /symbol/],
      ['model', () => new FakeModel(), /non-plain object/],
      ['nan', () => ({ ratio: Number.NaN }), /non-finite number/],
    ];

    for (const [name, produce, message] of cases) {
      const { status, nodeRuns } = await runSingleNode(
        `bad-${name}`,
        { script: './bad' },
        stubResolver({ './bad': produce }),
      );
      expect(status).toBe(EXECUTION_STATUS.ERROR);
      expect(nodeRuns[0].status).toBe(NODE_RUN_STATUS.ERROR);
      expect(nodeRuns[0].result).toBeNull();
      expect(nodeRuns[0].error).toMatch(message);
    }
  });

  // §11.2 (5)
  it('records a thrown exception as ERROR', async () => {
    const { status, nodeRuns } = await runSingleNode(
      'throwing',
      { script: './boom' },
      stubResolver({
        './boom': () => {
          throw new Error('remote service returned 500');
        },
      }),
    );
    expect(status).toBe(EXECUTION_STATUS.ERROR);
    expect(nodeRuns[0]).toMatchObject({
      status: NODE_RUN_STATUS.ERROR,
      result: null,
      error: 'remote service returned 500',
    });
  });

  // §11.2 (6)
  it('keeps ABORTED semantics when the run is aborted while the script is awaiting', async () => {
    const workflow = await createTestWorkflow(database, {
      key: 'aborted',
      // A one second timeout that the script outlives.
      options: { timeout: 0.05 },
      nodes: [{ key: 'script', type: 'run', config: { script: './slow' } }],
    });
    const resolver = stubResolver({
      './slow': (_args, runtime) =>
        new Promise((resolve, reject) => {
          runtime.signal.addEventListener(
            'abort',
            () => reject(runtime.signal.reason),
            { once: true },
          );
          setTimeout(resolve, 2000).unref?.();
        }),
    });
    const dispatcher = new Dispatcher({
      database,
      instructions: instructionsWith(resolver),
    });
    await dispatcher.trigger(
      workflow,
      {},
      { eventKey: 'aborted', manually: true },
    );

    const run = await findRun(database, 'aborted');
    expect(run.status).toBe(EXECUTION_STATUS.ABORTED);
    const nodeRuns = await listNodeRuns(database, run.id as number);
    expect(nodeRuns[0].status).toBe(NODE_RUN_STATUS.ABORTED);
  });

  it('hands the script the workflow abort signal and the application', async () => {
    let received: WorkflowRunRuntime | null = null;
    await runSingleNode(
      'runtime-shape',
      { script: './peek' },
      stubResolver({
        './peek': (_args, runtime) => {
          received = runtime;
          return null;
        },
      }),
    );
    expect(received).not.toBeNull();
    expect(received!.app).toBe(app);
    expect(received!.signal).toBeInstanceOf(AbortSignal);
    expect(typeof received!.logger.info).toBe('function');
    // D5: no transaction, and no field reserved for one.
    expect(Object.hasOwn(received!, 'transaction')).toBe(false);
  });

  it('never lets a script drive the nodeRun status', async () => {
    const { status, nodeRuns } = await runSingleNode(
      'status-field',
      { script: './business' },
      stubResolver({
        './business': () => ({
          status: 'failed',
          reason: 'credit score too low',
        }),
      }),
    );
    // `{ status: 'failed' }` is ordinary business data, not an engine status.
    expect(status).toBe(EXECUTION_STATUS.RESOLVED);
    expect(nodeRuns[0]).toEqual({
      nodeKey: 'script',
      status: NODE_RUN_STATUS.RESOLVED,
      result: { status: 'failed', reason: 'credit score too low' },
    });
  });

  it('cannot suspend: the run instruction implements no resume', () => {
    const instruction = createRunInstruction({
      resolver: stubResolver({}),
      app,
    });
    expect(instruction.resume).toBeUndefined();
    expect(instruction.branching).toBeUndefined();
  });

  it('fails a node that has no artifact binding', async () => {
    const { status, nodeRuns } = await runSingleNode(
      'unbound',
      { script: './server/calculate.ts' },
      unboundRunModuleResolver,
    );
    expect(status).toBe(EXECUTION_STATUS.ERROR);
    expect(nodeRuns[0].result).toBeNull();
    expect(nodeRuns[0].error).toMatch(/no workflow package artifact/);
  });

  it('reports an invalid config as an ERROR nodeRun', async () => {
    const { status, nodeRuns } = await runSingleNode(
      'no-script',
      {},
      stubResolver({}),
    );
    expect(status).toBe(EXECUTION_STATUS.ERROR);
    expect(nodeRuns[0].result).toBeNull();
    expect(nodeRuns[0].error).toMatch(/script must be a non-empty string/);
  });
});

describe('validateRunConfig', () => {
  it('accepts a static script path and an object of args', () => {
    expect(validateRunConfig({ script: './server/calculate.ts' })).toBeNull();
    expect(
      validateRunConfig({
        script: './server/calculate.ts',
        args: { id: '{{$context.id}}' },
      }),
    ).toBeNull();
  });

  it('rejects a missing script, a templated script, non-object args and unknown fields', () => {
    expect(validateRunConfig({})).toMatchObject({ script: expect.any(String) });
    expect(validateRunConfig({ script: '  ' })).toMatchObject({
      script: expect.any(String),
    });
    expect(
      validateRunConfig({ script: './server/{{$input.name}}.ts' }),
    ).toMatchObject({ script: expect.stringContaining('variable template') });
    expect(validateRunConfig({ script: './a.ts', args: [1] })).toMatchObject({
      args: expect.any(String),
    });
    expect(
      validateRunConfig({ script: './a.ts', transaction: true }),
    ).toMatchObject({ transaction: expect.any(String) });
  });
});

describe('assertWorkflowRunResult', () => {
  it('accepts JSON-compatible values', () => {
    expect(() =>
      assertWorkflowRunResult({ a: [1, 'x', null, { b: false }] }),
    ).not.toThrow();
  });

  it('accepts the same object twice when it is not actually circular', () => {
    const shared = { id: 1 };
    expect(() =>
      assertWorkflowRunResult({ left: shared, right: shared }),
    ).not.toThrow();
  });
});

describe('source directory resolver', () => {
  it('can be disabled explicitly', async () => {
    const resolver = createSourceDirResolver({
      rootPath: SOURCE_ROOT,
      enabled: false,
    });
    await expect(
      resolver.resolve({
        hash: null,
        nodeKey: 'script',
        sourcePath: './echo-args.mjs',
      }),
    ).rejects.toThrow(/resolver is disabled/);
  });

  it('loads a package-relative script and its nested modules', async () => {
    const resolver = createSourceDirResolver({
      rootPath: SOURCE_ROOT,
      enabled: true,
    });
    const top = await resolver.resolve({
      hash: 'abc',
      nodeKey: 'script',
      sourcePath: './echo-args.mjs',
    });
    await expect(
      Promise.resolve(
        top.run(
          { id: 1 },
          {
            app,
            signal: new AbortController().signal,
            logger: {
              debug: () => undefined,
              info: () => undefined,
              warn: () => undefined,
              error: () => undefined,
            },
          },
        ),
      ),
    ).resolves.toEqual({ received: { id: 1 } });

    const nested = await resolver.resolve({
      hash: 'abc',
      nodeKey: 'script',
      sourcePath: './lib/nested.mjs',
    });
    expect(typeof nested.run).toBe('function');
  });

  it('rejects absolute paths, URLs, bare specifiers, "..", and NUL', async () => {
    const resolver = createSourceDirResolver({
      rootPath: SOURCE_ROOT,
      enabled: true,
    });
    const rejected: [string, RegExp][] = [
      [path.join(SOURCE_ROOT, 'echo-args.mjs'), /must not be absolute/],
      ['file:///etc/passwd', /must not be a URL/],
      ['https://example.com/x.mjs', /must not be a URL/],
      ['lodash', /package-relative path/],
      ['server/calculate.mjs', /package-relative path/],
      ['../outside/secret.mjs', /package-relative path/],
      ['./../outside/secret.mjs', /must not contain "\.\."/],
      ['./echo\0.mjs', /NUL character/],
    ];
    for (const [sourcePath, message] of rejected) {
      await expect(
        resolver.resolve({ hash: null, nodeKey: 'script', sourcePath }),
      ).rejects.toThrow(message);
    }
  });

  it('rejects a symlink that escapes the source root', async () => {
    const link = path.join(SOURCE_ROOT, 'escaped.mjs');
    await fs.rm(link, { force: true });
    await fs.symlink(path.join(OUTSIDE_ROOT, 'secret.mjs'), link);
    try {
      const resolver = createSourceDirResolver({
        rootPath: SOURCE_ROOT,
        enabled: true,
      });
      await expect(
        resolver.resolve({
          hash: null,
          nodeKey: 'script',
          sourcePath: './escaped.mjs',
        }),
      ).rejects.toThrow(/escapes the source root/);
    } finally {
      await fs.rm(link, { force: true });
    }
  });

  it('reports a missing file and a module without a run export', async () => {
    const resolver = createSourceDirResolver({
      rootPath: SOURCE_ROOT,
      enabled: true,
    });
    await expect(
      resolver.resolve({
        hash: null,
        nodeKey: 'script',
        sourcePath: './nope.mjs',
      }),
    ).rejects.toThrow(/was not found/);
    await expect(
      resolver.resolve({
        hash: null,
        nodeKey: 'script',
        sourcePath: './no-run-export.mjs',
      }),
    ).rejects.toThrow(/must export a function named "run"/);
  });
});
