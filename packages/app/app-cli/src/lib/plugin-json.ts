// What the plugin and Skills commands share for reporting: compact plans, the commands a run would execute, and how a
// failure from the libraries they call becomes a `CommandError` with a stable code.
import {
  CommandError,
  describeCommandError,
  isCommandError,
  type CommandErrorJson,
} from '../command/errors.ts';

/** A plan without the complete rewritten sources it carries, keyed like the plan itself. */
export type PluginPlanJson<TPlan> = {
  readonly [
    TKey in keyof TPlan as TKey extends `${string}Text` ? never : TKey
  ]: TPlan[TKey];
};

/** A package manager invocation a run performs, or that a dry run would perform. */
export interface PluginCommandInvocation {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
}

/**
 * A failure a command recovered from, reported in its result next to what did succeed. It has the shape of the `error`
 * of a failed run, so a caller reads both the same way.
 */
export type PluginCommandIssue = CommandErrorJson;

/** Keeps machine-readable plans compact and avoids embedding complete rewritten source files. */
export function pluginPlanForJson<TPlan extends object>(
  plan: TPlan,
): PluginPlanJson<TPlan> {
  return Object.fromEntries(
    Object.entries(plan).filter(([key]) => !key.endsWith('Text')),
  ) as PluginPlanJson<TPlan>;
}

const PLUGIN_ERROR_RULES: readonly (readonly [
  needle: string,
  code: string,
  suggestions: readonly string[],
])[] = [
  [
    'is not installed',
    'PLUGIN_NOT_INSTALLED',
    ['Install dependencies and retry.'],
  ],
  [
    'is not registered',
    'PLUGIN_NOT_REGISTERED',
    ['Register the plugin first.'],
  ],
  [
    'Not registered in this app',
    'PLUGIN_NOT_REGISTERED',
    ['Select a registered plugin.'],
  ],
  [
    'refusing to overwrite it',
    'DEPENDENCY_RANGE_CONFLICT',
    ['Resolve the declared dependency range before retrying.'],
  ],
  [
    'Invalid skill directory',
    'INVALID_SKILL_DIRECTORY',
    [
      'Use a nocobase-prefixed kebab-case Skill name; plugin Skills must retain their package-owned prefix.',
    ],
  ],
  [
    'Skill name collision',
    'SKILL_NAME_COLLISION',
    ['Give each plugin Skill a unique owned name.'],
  ],
];

/** The code a plugin command reports for a failure no rule recognizes. */
export const PLUGIN_COMMAND_FAILED = 'PLUGIN_COMMAND_FAILED';

const FALLBACK_SUGGESTIONS: readonly string[] = [
  'Run the command with --help and correct the request.',
];

export interface PluginErrorOptions {
  /** The process exit code. Defaults to 1. */
  readonly exit?: number;
  readonly cause?: unknown;
}

/** A `CommandError` whose code and suggestions follow from what the message says went wrong. */
export function pluginError(
  message: string,
  options: PluginErrorOptions = {},
): CommandError {
  const rule = PLUGIN_ERROR_RULES.find(([needle]) => message.includes(needle));
  return new CommandError(message, {
    code: rule?.[1] ?? PLUGIN_COMMAND_FAILED,
    suggestions: rule?.[2] ?? FALLBACK_SUGGESTIONS,
    exit: options.exit,
    cause: options.cause,
  });
}

/**
 * The `CommandError` a plugin command fails with. A `CommandError` is already classified and passes through; anything
 * else, which is what the registration and Skills libraries throw, is classified by its message.
 */
export function classifyPluginError(error: unknown): CommandError {
  if (isCommandError(error)) return error;
  return pluginError(error instanceof Error ? error.message : String(error), {
    cause: error,
  });
}

/** A recovered failure as it appears in a result's `issues`. */
export function pluginCommandIssue(error: unknown): PluginCommandIssue {
  return describeCommandError(classifyPluginError(error)).json;
}
