// Reads the hooks the registered plugins declare, so `pnpm build` and `pnpm dev` can run them.
//
// Both scripts are plain Node and cannot read `cli/plugins.ts`, which is TypeScript and imports each plugin's CLI
// entry. So they ask the CLI, which has already assembled those plugins for its own dispatch, and spawn what comes
// back. One question covers both pipelines: `dev` pays a process start to ask, and asking twice would double it.
import spawn from 'cross-spawn';

const EMPTY = {
  build: {
    beforeBuild: [],
    afterClientBuild: [],
    afterServerBuild: [],
    afterBuild: [],
  },
  dev: { beforeDev: [] },
};

/**
 * Asks the application's CLI what its plugins have registered.
 *
 * A failure here fails the caller rather than being skipped with a warning. Not being able to ask means the CLI
 * assembly is broken — a plugin's entry failed to import, or `cli/plugins.ts` does not compile — and continuing
 * would produce a build that looks successful while silently missing whatever those hooks contribute. That is the
 * worst of the available outcomes: the omission surfaces only where the artifact is used, far from its cause.
 *
 * Declaring no hooks is not that case, and is not an error. A CLI that answers with four empty stages is an
 * application whose plugins contribute commands alone, which is most of them.
 */
export const readCliHooks = (rootDir) => {
  const result = spawn.sync(
    'pnpm',
    ['nocobase', 'plugin', 'cli-hooks', '--json'],
    {
      cwd: rootDir,
      encoding: 'utf8',
    },
  );

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    console.error(result.stderr ?? '');
    throw new Error(
      `Could not read plugin CLI hooks: \`pnpm nocobase plugin cli-hooks\` exited with ${result.status}.`,
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch (cause) {
    throw new Error(
      'Could not read plugin CLI hooks: the CLI did not print JSON.',
      { cause },
    );
  }

  return {
    build: { ...EMPTY.build, ...parsed.build },
    dev: { ...EMPTY.dev, ...parsed.dev },
  };
};

/** Runs one stage's hooks in order, through the caller's own step runner so they look like every other step. */
export const runHookStage = (hooks, stage, run) => {
  for (const hook of hooks[stage] ?? []) {
    run(hook.label, hook.command[0], hook.command.slice(1));
  }
};
