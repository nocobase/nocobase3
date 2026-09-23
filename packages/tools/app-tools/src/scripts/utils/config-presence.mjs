// Refuses to run an application that has nowhere to read its configuration from.
//
// Without this the failure is silent in the one place it matters most. `pnpm dev` runs the server under `tsx watch`,
// which prints the startup error and then waits for a file to change instead of exiting, while Vite carries on and
// prints a URL. The command looks like it worked, it exits with nothing, and the page it points at cannot reach an
// API. An agent following the output has no signal at all that something is wrong.
//
// What this checks is that a configuration source exists, not that its contents are valid. Validity is the runtime's
// job and it already does it well: a placeholder secret copied from the example, a missing `auth.secret`, a dialect
// with no driver — each is reported with the key and the command that fixes it. Those errors are worth reaching, so
// anything that could legitimately supply configuration passes here.
//
// Deliberately not wired into `build`. A build compiles the client and server, generates `dist/package.json` and
// installs production dependencies; none of that reads a secret. Requiring configuration there would break every
// template's own `pnpm check`, whose `config.yml` is gitignored and absent from a fresh checkout, and the Hub image
// build, which creates the application and builds it before any configuration exists — its configuration arrives at
// run time, where `start` checks for it.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** The extensions the runtime accepts, in the order it probes them. */
const CONFIG_EXTENSIONS = ['.yml', '.yaml', '.toml', '.json'];

/**
 * The configuration source this application would read, or `undefined` when it has none.
 *
 * `APP_CONFIG_FILE` is answered even when the file is absent, because the runtime loads a configured path
 * non-optionally: naming a file that is not there is an error worth reporting rather than a reason to keep looking.
 */
export function findConfigurationSource(rootDir, env) {
  const configured = env.APP_CONFIG_FILE;

  if (configured) {
    const file = path.resolve(rootDir, configured);
    return {
      kind: 'file',
      file,
      configured: true,
      exists: existsSync(file),
    };
  }

  for (const extension of CONFIG_EXTENSIONS) {
    const file = path.join(rootDir, `config${extension}`);
    if (existsSync(file)) {
      return { kind: 'file', file, configured: false, exists: true };
    }
  }

  // An application whose secrets come from the environment needs no file at all. Only `AUTH_SECRET` is looked for:
  // an application that has that one and not the others gets the runtime's own error naming exactly which is missing.
  if ((env.AUTH_SECRET ?? '').trim() !== '' || hasDotenvAuthSecret(rootDir)) {
    return {
      kind: 'environment',
      file: undefined,
      configured: false,
      exists: true,
    };
  }

  return undefined;
}

/**
 * Whether a `.env` file assigns `AUTH_SECRET` a value.
 *
 * Deliberately a probe rather than a dotenv implementation: this only has to decide whether the application has a
 * configuration source, and the runtime parses these files properly a moment later. `start` runs under plain Node
 * from a script the application owns, so it cannot import the loader the way `dev` does — in a source checkout that
 * loader is TypeScript, which Node will not resolve.
 */
function hasDotenvAuthSecret(rootDir) {
  for (const name of ['.env.local', '.env']) {
    const file = path.join(rootDir, name);

    if (!existsSync(file)) {
      continue;
    }

    const assignment =
      /^[^\S\n]*(?:export[^\S\n]+)?AUTH_SECRET[^\S\n]*=(.*)$/mu.exec(
        readFileSync(file, 'utf8'),
      );

    if (
      assignment &&
      assignment[1].trim().replaceAll(/^["']|["']$/gu, '') !== ''
    ) {
      return true;
    }
  }

  return false;
}

/** Stops with something the reader can run, rather than letting the server fail where nothing will show it. */
export function assertConfigurationPresent(rootDir, env, label) {
  const source = findConfigurationSource(rootDir, env);

  if (source?.exists) {
    return;
  }

  const lines =
    source === undefined
      ? [
          `[${label}] This application has no configuration.`,
          '',
          'Create it with:',
          '  pnpm config:init',
          '',
          'Or supply auth.secret and session.secret through AUTH_SECRET and SESSION_SECRET.',
        ]
      : [
          `[${label}] APP_CONFIG_FILE points at a file that does not exist:`,
          `  ${source.file}`,
        ];

  console.error(lines.join('\n'));
  process.exit(1);
}
