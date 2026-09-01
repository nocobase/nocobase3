import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

import { NODE_RUN_STATUS } from '../../engine/constants.js';
import { createNodeExpression } from '../definition.js';
import type {
  ConfigIssue,
  NodeExpression,
  WorkflowNodeSourceInput,
} from '../types.js';
import type {
  JsonObject,
  WorkflowLogger,
  WorkflowNode,
} from '../../engine/types.js';
import {
  WorkflowInstruction,
  type WorkflowInstructionContext,
  type WorkflowInstructionResult,
} from '../base.js';
import { logRunExecution } from '../../engine/inspector.js';
import type { WorkflowArtifactDefinition } from '../../loader/artifact-builder.js';

export type WorkflowRunJsonValue =
  | null
  | boolean
  | number
  | string
  | WorkflowRunJsonValue[]
  | { [key: string]: WorkflowRunJsonValue };

export type WorkflowRunArgs = Record<string, unknown>;

/**
 * Everything a run script gets besides its declared `args`.
 *
 * D5: exactly three members. `transaction` is not provided and no field is
 * reserved for it — a script that needs a transaction opens one through
 * `runtime.app` and owns its boundary.
 */
export interface WorkflowRunRuntime {
  /**
   * The application instance.
   *
   * Still `unknown` after T5: the repository has no `Application` (or equivalent)
   * type to point at — `app-host` exposes a registry and a runtime record, not an
   * application object — so anything narrower here would be invented rather than
   * observed. It is tightened when an application type actually exists.
   */
  readonly app: unknown;
  readonly signal: AbortSignal;
  readonly logger: WorkflowLogger;
}

export type WorkflowRunFunction = (
  args: unknown,
  runtime: WorkflowRunRuntime,
) => unknown;

export interface WorkflowRunModule {
  run: WorkflowRunFunction;
}

export type RunConfig = JsonObject & {
  module: string;
  args?: JsonObject;
};

const TEMPLATE_PATTERN = /\{\{[^{}]*\}\}/;
const requireRunModule: NodeJS.Require = createRequire(import.meta.url);
const moduleCache = new Map<string, Promise<WorkflowRunModule>>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Hand-written config validation (D3: the first version has no schema library). */
function runConfigIssues(config: unknown): ConfigIssue[] {
  if (config === null || typeof config !== 'object' || Array.isArray(config)) {
    return [{ path: 'config', message: 'run config must be an object' }];
  }
  const record = config as JsonObject;
  const errors: ConfigIssue[] = [];
  for (const key of Object.keys(record)) {
    if (key !== 'module' && key !== 'args') {
      errors.push({
        path: `config.${key}`,
        message: `run config does not accept field "${key}"`,
      });
    }
  }
  if (typeof record.module !== 'string' || !record.module.trim()) {
    errors.push({
      path: 'config.module',
      message: 'run config module must be a non-empty string',
    });
  } else if (TEMPLATE_PATTERN.test(record.module)) {
    // The entry of a published version has to be static and auditable.
    errors.push({
      path: 'config.module',
      message: 'run config module must not contain a variable template',
    });
  } else {
    const specifier = record.module;
    const segments = specifier.startsWith('./')
      ? specifier.slice(2).split('/')
      : [];
    if (
      segments.length === 0 ||
      segments.some(
        (segment) =>
          !segment ||
          segment === '.' ||
          segment === '..' ||
          segment.includes('\\'),
      ) ||
      path.posix.extname(specifier) !== '' ||
      /[?#\0]/.test(specifier)
    ) {
      errors.push({
        path: 'config.module',
        message:
          'run config module must be an extensionless package-relative specifier starting with "./"',
      });
    }
  }
  if (record.args !== undefined && !isRecord(record.args)) {
    errors.push({
      path: 'config.args',
      message: 'run config args must be an object',
    });
  }
  return errors;
}

export function validateRunConfig(
  config: JsonObject,
): Record<string, string> | null {
  const issues = runConfigIssues(config);
  const errors = Object.fromEntries(
    issues.map(({ path, message }) => [path.replace(/^config\./, ''), message]),
  );
  return issues.length ? errors : null;
}

function readRunConfig(config: JsonObject): RunConfig {
  const issues = runConfigIssues(config);
  if (issues.length) {
    throw new Error(
      `Invalid run config: ${issues.map(({ message }) => message).join('; ')}`,
    );
  }
  return {
    module: String(config.module),
    ...(config.args === undefined ? {} : { args: config.args as JsonObject }),
  };
}

function describe(value: unknown): string {
  if (typeof value === 'bigint') {
    return 'a BigInt';
  }
  if (typeof value === 'function') {
    return 'a function';
  }
  if (typeof value === 'symbol') {
    return 'a symbol';
  }
  if (typeof value === 'number') {
    return 'a non-finite number';
  }
  return 'a non-plain object';
}

/**
 * Reject anything the nodeRun store could not round-trip through JSON: circular
 * references, BigInt, functions, symbols, non-finite numbers and class
 * instances such as an ORM model.
 */
export function assertWorkflowRunResult(
  value: unknown,
  location: string = 'result',
  ancestors: Set<object> = new Set<object>(),
): void {
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'string'
  ) {
    return;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(
        `Run script ${location} is ${describe(value)} and cannot be stored`,
      );
    }
    return;
  }
  if (typeof value !== 'object') {
    throw new Error(
      `Run script ${location} is ${describe(value)} and cannot be stored`,
    );
  }
  if (ancestors.has(value)) {
    throw new Error(
      `Run script ${location} contains a circular reference and cannot be stored`,
    );
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      value.forEach((item, index) =>
        assertWorkflowRunResult(item, `${location}[${index}]`, ancestors),
      );
      return;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error(
        `Run script ${location} is ${describe(value)} and cannot be stored`,
      );
    }
    for (const [key, item] of Object.entries(value)) {
      assertWorkflowRunResult(item, `${location}.${key}`, ancestors);
    }
  } finally {
    ancestors.delete(value);
  }
}

/**
 * `run` — executes a server script that ships with the workflow package.
 *
 * The instruction owns module lookup within the Processor-bound workflow
 * resources, config and result validation, argument resolution, and exception
 * mapping. It does not compile TypeScript or let a module drive the state
 * machine: returning `{ status: 'failed' }` is ordinary business data, never a
 * nodeRun status. There is no `resume()` — a run node can never be PENDING.
 */
export class RunInstruction extends WorkflowInstruction<RunConfig> {
  static readonly type: 'run' = 'run';
  static readonly branches: null = null;
  static readonly result: null = null;
  constructor(context: WorkflowInstructionContext) {
    super({ ...context, node: context.node as WorkflowNode<RunConfig> });
  }

  static create(source: WorkflowNodeSourceInput<RunConfig>): NodeExpression {
    return createNodeExpression(RunInstruction, source);
  }

  static validateConfig(config: unknown): ConfigIssue[] {
    return runConfigIssues(config);
  }

  async run(): Promise<WorkflowInstructionResult> {
    const config = readRunConfig(this.config);
    const args = this.processor.getParsedValue(config.args ?? {}, this.node.id);
    const signal = this.signal;
    const module = await loadRunModule(
      this.processor.workflowResourceRoot,
      config.module,
      this.node.key,
    );
    const startedAt = performance.now();
    let result: unknown;
    try {
      result = await module.run(args, {
        app: this.processor.app,
        signal,
        logger: this.processor.logger,
      });
      logRunExecution(this.processor.logger, {
        workflowId: this.processor.workflow.id,
        executionId: this.processor.execution.id,
        nodeId: this.node.id,
        nodeKey: this.node.key,
        artifactDigest: this.processor.execution.hash,
        module: config.module,
        durationMs: performance.now() - startedAt,
        status: 'success',
      });
    } catch (error) {
      logRunExecution(this.processor.logger, {
        workflowId: this.processor.workflow.id,
        executionId: this.processor.execution.id,
        nodeId: this.node.id,
        nodeKey: this.node.key,
        artifactDigest: this.processor.execution.hash,
        module: config.module,
        durationMs: performance.now() - startedAt,
        status: signal.aborted ? 'aborted' : 'error',
      });
      throw error;
    }

    // `undefined` would otherwise collide with the instruction protocol's
    // "no return value means exit silently", so normalize it to `null`.
    const normalized = result === undefined ? null : result;
    assertWorkflowRunResult(normalized);
    return { status: NODE_RUN_STATUS.RESOLVED, result: normalized };
  }
}

async function loadRunModule(
  workflowResourceRoot: string | null,
  specifier: string,
  nodeKey: string,
): Promise<WorkflowRunModule> {
  if (!workflowResourceRoot) {
    throw new Error(
      `Run node "${nodeKey}" has no workflow package artifact bound to it`,
    );
  }
  const manifestPath = path.join(workflowResourceRoot, 'workflow.json');
  let target: string;
  try {
    const manifest = JSON.parse(
      await fs.readFile(manifestPath, 'utf8'),
    ) as WorkflowArtifactDefinition;
    const output = manifest.server?.run?.[specifier];
    if (!output) {
      throw new Error(
        `Run module "${specifier}" is not present in the workflow artifact`,
      );
    }
    target = resolveInsideRoot(workflowResourceRoot, output, specifier);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    target = await resolveSourceModule(workflowResourceRoot, specifier);
  }
  const cached = moduleCache.get(target);
  if (cached) return cached;
  const pending = importRunModule(target, specifier);
  moduleCache.set(target, pending);
  return pending;
}

function resolveInsideRoot(
  root: string,
  relativePath: string,
  specifier: string,
): string {
  const target = path.resolve(root, relativePath);
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Run module "${specifier}" resolves outside its artifact`);
  }
  return target;
}

async function resolveSourceModule(
  root: string,
  specifier: string,
): Promise<string> {
  const base = resolveInsideRoot(root, specifier, specifier);
  for (const extension of ['.ts', '.js', '.mjs']) {
    const target = `${base}${extension}`;
    try {
      const realRoot = await fs.realpath(root);
      const realTarget = await fs.realpath(target);
      const relative = path.relative(realRoot, realTarget);
      if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error(
          `Run module "${specifier}" resolves outside its workflow resources`,
        );
      }
      return realTarget;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  throw new Error(`Run module "${specifier}" was not found`);
}

async function importRunModule(
  target: string,
  specifier: string,
): Promise<WorkflowRunModule> {
  const loaded = target.endsWith('.cjs')
    ? (requireRunModule(target) as Record<string, unknown>)
    : ((await import(pathToFileURL(target).href)) as Record<string, unknown>);
  if (typeof loaded.run !== 'function') {
    throw new Error(
      `Run module "${specifier}" must export a function named run`,
    );
  }
  return { run: loaded.run as WorkflowRunFunction };
}
