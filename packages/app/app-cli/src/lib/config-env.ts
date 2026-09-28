import { RUNTIME_ENVIRONMENT_VARIABLES } from '@nocobase/app-server/config';

import type { AppCommandRuntime } from '../context.ts';

export interface ConfigEnvVariable {
  readonly name: string;
  /** The configuration path the variable sets, for one a section declares. */
  readonly path?: string;
  /** What the runtime does with it, for one the runtime reads itself. */
  readonly description?: string;
  /** Whether the environment the application would start with sets it. The value is never reported. */
  readonly set: boolean;
}

export interface ConfigEnvResult {
  readonly variables: readonly ConfigEnvVariable[];
}

export interface ConfigEnvOptions {
  /** Loads the application exactly as a start would, without starting it. */
  readonly loadRuntime: () => Promise<AppCommandRuntime>;
}

/**
 * Lists every environment variable the application reads: those its configuration sections declare in `env`, and
 * those the runtime reads itself. Values are left out because many are secrets; whether each is set is enough to tell
 * what the environment changes.
 */
export async function runConfigEnv(
  options: ConfigEnvOptions,
): Promise<ConfigEnvResult> {
  const runtime = await options.loadRuntime();
  try {
    const environment = runtime.env;
    const isSet = (name: string): boolean =>
      environment[name] !== undefined && environment[name] !== '';
    const declared = Object.entries(
      runtime.config.sectionEnvironmentVariables(),
    )
      .map(([name, path]) => ({ name, path, set: isSet(name) }))
      .sort((a, b) => a.path.localeCompare(b.path));
    const runtimeRead = RUNTIME_ENVIRONMENT_VARIABLES.map((variable) => ({
      name: variable.name,
      description: variable.description,
      set: isSet(variable.name),
    }));
    return { variables: [...declared, ...runtimeRead] };
  } finally {
    await runtime.scope.destroy();
  }
}
