export const PLUGIN_JSON_SCHEMA_VERSION = 1;

export type PluginCommandStatus =
  'success' | 'success-noop' | 'partial-success' | 'requires-installation';

export interface PluginJsonError {
  readonly code: string;
  readonly message: string;
  readonly suggestions: readonly string[];
}

export function pluginJsonSuccess(
  operation: string,
  status: PluginCommandStatus,
  result: Record<string, unknown>,
): Record<string, unknown> {
  return {
    schemaVersion: PLUGIN_JSON_SCHEMA_VERSION,
    ok: true,
    operation,
    status,
    result,
  };
}

export function pluginJsonFailure(
  operation: string,
  error: PluginJsonError,
): Record<string, unknown> {
  return {
    schemaVersion: PLUGIN_JSON_SCHEMA_VERSION,
    ok: false,
    operation,
    status: 'failure',
    error,
  };
}

/** Keeps machine-readable plans compact and avoids embedding complete rewritten source files. */
export function pluginPlanForJson(plan: object): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(plan).filter(([key]) => !key.endsWith('Text')),
  );
}

export function classifyPluginError(error: unknown): PluginJsonError {
  const message = error instanceof Error ? error.message : String(error);
  const rules: readonly [string, string, readonly string[]][] = [
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
      ['Rename the Skill directory to the plugin-owned prefix.'],
    ],
    [
      'Skill name collision',
      'SKILL_NAME_COLLISION',
      ['Give each plugin Skill a unique owned name.'],
    ],
  ];
  for (const [needle, code, suggestions] of rules) {
    if (message.includes(needle)) return { code, message, suggestions };
  }
  return {
    code: 'PLUGIN_COMMAND_FAILED',
    message,
    suggestions: ['Run the command with --help and correct the request.'],
  };
}
