import { NODE_RUN_STATUS } from '../constants.js';
import type Processor from '../processor.js';
import type {
  JsonObject,
  WorkflowInstruction,
  WorkflowInstructionResult,
  WorkflowLogger,
  WorkflowNode,
  WorkflowNodeRun,
} from '../types.js';

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

export type WorkflowRunFunction = (args: unknown, runtime: WorkflowRunRuntime) => unknown;

export interface WorkflowRunModule {
  run: WorkflowRunFunction;
}

export interface WorkflowRunModuleRequest {
  /**
   * Package digest the run belongs to. Today this is `workflow.hash`; once
   * `workflowRuns.hash` exists it becomes the digest frozen at run creation, so
   * a historical run keeps loading the artifact it started with.
   */
  hash: string | null;
  nodeKey: string;
  sourcePath: string;
}

/**
 * The seam that decides *where a module comes from*.
 *
 * The instruction body never touches the file system: it hands the resolver a
 * package digest plus the declared relative path and gets back a module. M1
 * ships only the dev-only `SourceDirResolver`; M5 replaces it with an artifact
 * resolver without touching the instruction.
 */
export interface WorkflowRunModuleResolver {
  resolve(request: WorkflowRunModuleRequest): Promise<WorkflowRunModule>;
}

export interface RunInstructionOptions {
  resolver: WorkflowRunModuleResolver;
  /** The application instance handed to every script as `runtime.app`; see `WorkflowRunRuntime.app`. */
  app: unknown;
}

export interface RunConfig {
  script: string;
  args?: JsonObject;
}

const TEMPLATE_PATTERN = /\{\{[^{}]*\}\}/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Hand-written config validation (D3: the first version has no schema library). */
export function validateRunConfig(config: JsonObject): Record<string, string> | null {
  const errors: Record<string, string> = {};
  for (const key of Object.keys(config)) {
    if (key !== 'script' && key !== 'args') {
      errors[key] = `run config does not accept field "${key}"`;
    }
  }
  if (typeof config.script !== 'string' || !config.script.trim()) {
    errors.script = 'run config script must be a non-empty string';
  } else if (TEMPLATE_PATTERN.test(config.script)) {
    // The entry of a published version has to be static and auditable.
    errors.script = 'run config script must not contain a variable template';
  }
  if (config.args !== undefined && !isRecord(config.args)) {
    errors.args = 'run config args must be an object';
  }
  return Object.keys(errors).length ? errors : null;
}

function readRunConfig(config: JsonObject): RunConfig {
  const errors = validateRunConfig(config);
  if (errors) {
    throw new Error(`Invalid run config: ${Object.values(errors).join('; ')}`);
  }
  return {
    script: String(config.script),
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
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`Run script ${location} is ${describe(value)} and cannot be stored`);
    }
    return;
  }
  if (typeof value !== 'object') {
    throw new Error(`Run script ${location} is ${describe(value)} and cannot be stored`);
  }
  if (ancestors.has(value)) {
    throw new Error(`Run script ${location} contains a circular reference and cannot be stored`);
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      value.forEach((item, index) => assertWorkflowRunResult(item, `${location}[${index}]`, ancestors));
      return;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error(`Run script ${location} is ${describe(value)} and cannot be stored`);
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
 * The instruction owns config validation, argument resolution, result
 * validation and the mapping of exceptions onto nodeRun statuses. It deliberately
 * does not resolve paths, compile TypeScript, or let a script drive the state
 * machine: a script returning `{ status: 'failed' }` is ordinary business data,
 * never a nodeRun status. There is no `resume()` — a run node can never be PENDING.
 */
export function createRunInstruction(options: RunInstructionOptions): WorkflowInstruction {
  return {
    validateConfig: validateRunConfig,

    async run(
      node: WorkflowNode,
      _input: WorkflowNodeRun | { result: unknown } | undefined,
      processor: Processor,
      runOptions?: { rerun?: true; signal?: AbortSignal },
    ): Promise<WorkflowInstructionResult> {
      const config = readRunConfig(node.config);
      const args = processor.getParsedValue(config.args ?? {}, node.id);
      const signal = runOptions?.signal ?? processor.abortSignal;

      const module = await options.resolver.resolve({
        hash: processor.workflow.hash,
        nodeKey: node.key,
        sourcePath: config.script,
      });

      const result = await module.run(args, {
        app: options.app,
        signal,
        logger: processor.logger,
      });

      // `undefined` would otherwise collide with the instruction protocol's
      // "no return value means exit silently", so normalize it to `null`.
      const normalized = result === undefined ? null : result;
      assertWorkflowRunResult(normalized);
      return { status: NODE_RUN_STATUS.RESOLVED, result: normalized };
    },
  };
}
