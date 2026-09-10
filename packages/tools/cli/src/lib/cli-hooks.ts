// Collects the hooks the registered plugins declare, in the order an application runs them.
//
// The result is shaped for the consumer rather than for this package: an application's `scripts/build.mjs` and
// `scripts/dev/index.mjs` are plain Node and cannot read `cli/plugins.ts` at all, so they ask this CLI for the list
// and spawn what comes back. That is why a hook carries a resolved `label` and a plain `command` array — neither
// script should have to know that a label is optional to run one.
//
// Both pipelines are reported together because both callers pay a process start to ask, and `dev` is the one where
// that cost is felt. Asking once and reading the half you need is cheaper than a second cold start.
import {
  APP_BUILD_HOOK_STAGES,
  APP_DEV_HOOK_STAGES,
  type AppBuildHookStage,
  type AppCliHook,
  type AppCliPlugin,
  type AppCliPlugins,
  type AppDevHookStage,
} from '../plugins/types.ts';

export interface ResolvedCliHook {
  /** The plugin that declared it, so a failing step can be traced back without reading every plugin's CLI entry. */
  readonly packageName: string;
  /** The phrase naming the step in the log; the command itself when the plugin declared no label. */
  readonly label: string;
  readonly command: readonly string[];
}

/** Every stage, including the empty ones: a consumer iterates the result rather than knowing the stage names. */
export type ResolvedBuildHooks = Readonly<
  Record<AppBuildHookStage, readonly ResolvedCliHook[]>
>;

export type ResolvedDevHooks = Readonly<
  Record<AppDevHookStage, readonly ResolvedCliHook[]>
>;

export interface ResolvedCliHooks {
  readonly build: ResolvedBuildHooks;
  readonly dev: ResolvedDevHooks;
}

export function collectCliHooks(
  plugins: AppCliPlugins | undefined,
): ResolvedCliHooks {
  const registered = plugins?.plugins ?? [];

  // Plugin order first, then declaration order within a stage. Both come from a file the application owns and edits:
  // `cli/plugins.ts` is where the array order is, and it already means registration order for commands.
  const collect = <Stage extends string>(
    stages: readonly Stage[],
    pick: (
      plugin: AppCliPlugin,
    ) => Readonly<Partial<Record<Stage, readonly AppCliHook[]>>>,
  ): Record<Stage, readonly ResolvedCliHook[]> => {
    const collected: Partial<Record<Stage, readonly ResolvedCliHook[]>> = {};

    for (const stage of stages) {
      const hooks: ResolvedCliHook[] = [];
      for (const plugin of registered) {
        for (const hook of pick(plugin)[stage] ?? []) {
          hooks.push({
            packageName: plugin.packageName,
            label: hook.label ?? hook.command.join(' '),
            command: hook.command,
          });
        }
      }
      collected[stage] = Object.freeze(hooks);
    }

    // The loop above assigns every stage, which the compiler cannot see through a `Partial` it filled in a loop.
    // Every stage is present because a consumer iterates the result rather than testing each key for existence.
    return Object.freeze(collected) as Record<
      Stage,
      readonly ResolvedCliHook[]
    >;
  };

  return Object.freeze({
    build: collect(APP_BUILD_HOOK_STAGES, (plugin) => plugin.buildHooks),
    dev: collect(APP_DEV_HOOK_STAGES, (plugin) => plugin.devHooks),
  });
}
