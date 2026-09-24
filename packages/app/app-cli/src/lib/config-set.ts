import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import { isMap, isSeq, parse, parseDocument } from 'yaml';

import type { AppCommandRuntime } from '../context.js';
import {
  detectConfigInitMode,
  resolveDeploymentRootDir,
} from './config-init.js';
import {
  activeConfigFile,
  closestKey,
  exampleSections,
} from './config-keys.js';

export type ConfigSetErrorReason =
  | 'invalid-assignment'
  | 'unknown-key'
  | 'environment-variable-missing'
  | 'not-configured'
  | 'unsupported-format'
  | 'not-a-section';

export class ConfigSetError extends Error {
  public readonly reason: ConfigSetErrorReason;
  public readonly suggestedCommand?: string;
  public readonly details?: Readonly<Record<string, unknown>>;

  public constructor(
    reason: ConfigSetErrorReason,
    message: string,
    options: {
      readonly suggestedCommand?: string;
      readonly details?: Readonly<Record<string, unknown>>;
    } = {},
  ) {
    super(message);
    this.name = 'ConfigSetError';
    this.reason = reason;
    this.suggestedCommand = options.suggestedCommand;
    this.details = options.details;
  }
}

export interface ConfigSetOptions {
  readonly rootDir: string;
  /** `key=value`, as given on the command line. */
  readonly assignments: readonly string[];
  /** Read each value as the name of an environment variable, so a secret never appears on the command line. */
  readonly fromEnv?: boolean;
  readonly loadRuntime: () => Promise<AppCommandRuntime>;
  readonly environment?: NodeJS.ProcessEnv;
}

export interface ConfigSetResult {
  readonly configFile: string;
  readonly changed: readonly string[];
  readonly warnings: readonly string[];
}

interface Assignment {
  readonly key: string;
  readonly path: readonly string[];
  readonly value: unknown;
}

const SENSITIVE =
  /(secret|password|passwd|pass|token|apikey|api_key|credential)$/iu;

/**
 * Sets configuration values in the file the application reads, keeping its comments and layout.
 *
 * Everything is parsed and validated before the file is touched, and the file is written once, so a rejected
 * assignment leaves it exactly as it was. Afterwards the configuration is loaded again and each key compared with what
 * was written: a key the environment overrides, or a file the application does not read, looks like a successful edit
 * and changes nothing, and saying so is the difference between a working configuration and a confusing one.
 */
export async function runConfigSet(
  options: ConfigSetOptions,
): Promise<ConfigSetResult> {
  const rootDir = path.resolve(options.rootDir);
  const environment = options.environment ?? process.env;
  const warnings: string[] = [];

  const assignments = options.assignments.map((raw) =>
    parseAssignment(raw, options.fromEnv === true, environment),
  );
  if (assignments.length === 0) {
    throw new ConfigSetError(
      'invalid-assignment',
      'Nothing to set. Pass one or more key=value assignments.',
    );
  }
  if (options.fromEnv !== true) {
    for (const assignment of assignments) {
      if (SENSITIVE.test(assignment.path.at(-1) ?? ''))
        warnings.push(
          `${assignment.key} looks like a secret and was given on the command line, where it stays in the shell history. Prefer --from-env.`,
        );
    }
  }

  // The runtime is what knows which sections exist. It may not load — setting a value is also how a broken
  // configuration is repaired — so its absence narrows the check to the documented sections instead of blocking.
  let runtime: AppCommandRuntime | undefined;
  try {
    runtime = await options.loadRuntime();
  } catch {
    runtime = undefined;
  }

  let configFile: string;
  let known: Set<string>;
  try {
    const mode = await detectConfigInitMode(rootDir);
    const deploymentRootDir =
      runtime?.paths.deploymentRootDir ??
      resolveDeploymentRootDir(rootDir, mode);
    configFile = activeConfigFile(
      rootDir,
      deploymentRootDir,
      runtime,
      environment,
    );
    known = new Set([
      ...(runtime ? Object.keys(runtime.config.layers().defaults) : []),
      ...(await exampleSections(deploymentRootDir)),
    ]);
  } finally {
    await runtime?.scope.destroy();
  }

  for (const assignment of assignments) {
    const section = assignment.path[0];
    if (known.has(section)) continue;
    const suggestion = closestKey(section, known);
    if (runtime === undefined) {
      warnings.push(
        `"${section}" could not be confirmed as a configuration section, because the configuration does not load.`,
      );
      continue;
    }
    throw new ConfigSetError(
      'unknown-key',
      `"${section}" is not a configuration section this application knows, so nothing would read ${assignment.key}.${
        suggestion ? ` Did you mean "${suggestion}"?` : ''
      }`,
      {
        details: { key: assignment.key, ...(suggestion ? { suggestion } : {}) },
      },
    );
  }

  if (!existsSync(configFile)) {
    throw new ConfigSetError(
      'not-configured',
      'This application has no configuration file to set values in.',
      { suggestedCommand: 'pnpm config:init' },
    );
  }
  if (!/\.ya?ml$/u.test(configFile)) {
    throw new ConfigSetError(
      'unsupported-format',
      `${path.basename(configFile)} is not YAML; edit it directly.`,
      { details: { configFile } },
    );
  }

  const document = parseDocument(await readFile(configFile, 'utf8'));
  if (document.errors.length > 0) {
    throw new ConfigSetError(
      'invalid-assignment',
      `${configFile} is not valid YAML: ${document.errors[0].message}`,
    );
  }
  for (const assignment of assignments) {
    assertMapPath(document, assignment);
    document.setIn(assignment.path, assignment.value);
  }
  await writeFile(configFile, document.toString(), 'utf8');

  warnings.push(...(await confirmApplied(options.loadRuntime, assignments)));

  return {
    configFile,
    changed: assignments.map((assignment) => assignment.key),
    warnings,
  };
}

function parseAssignment(
  raw: string,
  fromEnv: boolean,
  environment: NodeJS.ProcessEnv,
): Assignment {
  const separator = raw.indexOf('=');
  const key = separator === -1 ? '' : raw.slice(0, separator).trim();
  const keyPath = key.split('.');
  if (
    separator === -1 ||
    key === '' ||
    keyPath.some((segment) => segment === '')
  ) {
    throw new ConfigSetError(
      'invalid-assignment',
      `"${raw}" is not an assignment. Write it as key=value, for example database.connections.main.host=db.internal.`,
    );
  }
  const text = raw.slice(separator + 1);

  if (fromEnv) {
    const name = text.trim();
    const value = environment[name];
    if (name === '' || value === undefined) {
      throw new ConfigSetError(
        'environment-variable-missing',
        `The environment variable "${name}" for ${key} is not set.`,
        { details: { key, variable: name } },
      );
    }
    return { key, path: keyPath, value };
  }

  // A value is read the way YAML reads it, so `13000` is a number and `true` a boolean, and quoting keeps a string.
  // Lists and maps are refused: addressing an item by position breaks the moment the file is reordered.
  const value: unknown = text.trim() === '' ? '' : parse(text);
  if (typeof value === 'object' && value !== null) {
    throw new ConfigSetError(
      'invalid-assignment',
      `${key} would be set to a list or a map. Set one value at a time, or edit lists in the file itself; quote the value if it is text.`,
      { details: { key } },
    );
  }
  return { key, path: keyPath, value };
}

/** A value can only be set below maps; anything else in the way is a list or a value the path cannot pass through. */
function assertMapPath(
  document: ReturnType<typeof parseDocument>,
  assignment: Assignment,
): void {
  for (let depth = 1; depth < assignment.path.length; depth += 1) {
    const node: unknown = document.getIn(assignment.path.slice(0, depth), true);
    if (node === undefined || node === null || isMap(node)) continue;
    throw new ConfigSetError(
      'not-a-section',
      `${assignment.path.slice(0, depth).join('.')} is ${
        isSeq(node) ? 'a list' : 'a value'
      }, so ${assignment.key} cannot be set below it. Edit it in the file.`,
      { details: { key: assignment.key } },
    );
  }
}

/**
 * Loads the configuration again and names any key whose effective value is not what was written.
 *
 * Values are never repeated in the warning: a key set with `--from-env` is a secret, and so, often, is the value that
 * overrides it.
 */
async function confirmApplied(
  loadRuntime: () => Promise<AppCommandRuntime>,
  assignments: readonly Assignment[],
): Promise<string[]> {
  let runtime: AppCommandRuntime;
  try {
    runtime = await loadRuntime();
  } catch (error) {
    return [
      `The file was updated, but the configuration does not load yet: ${
        error instanceof Error ? error.message : String(error)
      } Run pnpm config:check for details.`,
    ];
  }
  try {
    return assignments
      .filter(
        (assignment) =>
          !isDeepStrictEqual(
            runtime.config.get(assignment.key),
            assignment.value,
          ),
      )
      .map(
        (assignment) =>
          `${assignment.key} was written, but the application still reads a different value: an environment variable overrides it, or this is not the file the application loads.`,
      );
  } finally {
    await runtime.scope.destroy();
  }
}
