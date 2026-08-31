import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Local state a hub writes as it runs lives here, mirroring the `.nb3/` a generated app keeps. */
export const HUB_STATE_DIR = '.nb3';

export const DEFAULT_HUB_PORT = 3000;
export const DEFAULT_HUB_HOST = '127.0.0.1';

export interface HubConfig {
  name: string;
  port: number;
  host: string;
}

/**
 * The `.nb3/hub.json` the `nb3 hub` commands look for.
 *
 * This file is how a hub is told apart from an app: both keep a `.nb3/` directory, and which file it holds decides
 * which set of commands applies. A hub scaffolded without it is not discoverable by `nb3 hub start`, `stop`, `logs`,
 * or `status`, all of which walk up from the working directory looking for exactly this path.
 */
export function buildHubConfigFile(config: HubConfig): string {
  return `${JSON.stringify(config, null, 2)}\n`;
}

export interface BuildHubEnvOptions {
  name: string;
  /** Contents of the template's `.env.example`, used as the base so its comments and optional keys survive. */
  example?: string;
}

/**
 * Builds the `.env` a generated hub starts with.
 *
 * A hub is configured through environment variables rather than the `config.yml` an app uses — it owns no database,
 * only a Portal host and a proxy to an upstream NocoBase API. The template ships `.env.example` but not `.env`, and
 * nothing reads the example, so a hub generated without this step runs entirely on defaults with no file to edit.
 *
 * The example is used as the base rather than generating the file from scratch, so the comments explaining each
 * setting and the commented-out optional keys reach the user.
 *
 * Only `APP_NAME` is rewritten. `APP_BASE_PATH` deliberately stays at the template's `/hub`: it is the path the hub is
 * served under rather than an identifier, and a hub is a fixed piece of infrastructure at a known address. A
 * deployment that wants it elsewhere sets the value itself.
 */
export function buildHubEnvFile(options: BuildHubEnvOptions): string {
  const { name } = options;
  const example = options.example ?? FALLBACK_HUB_ENV;

  return `${setEnvValue(example, 'APP_NAME', name).trimEnd()}\n`;
}

/**
 * Written when the template ships no `.env.example`, so a generated hub is never left without the settings that name
 * it and place it.
 */
const FALLBACK_HUB_ENV = [
  '# Application',
  'APP_NAME=hub',
  'APP_BASE_PATH=/hub',
  '',
].join('\n');

/**
 * Rewrites one assignment in an env file, leaving the rest of the file byte for byte as it was.
 *
 * Only an uncommented assignment is replaced. A commented-out key is a documented default the user may want to switch
 * on later, so uncommenting it here would silently apply a setting they never chose. A key the file does not assign at
 * all is appended, which keeps the function total: the caller gets a file that sets the value either way.
 */
function setEnvValue(contents: string, key: string, value: string): string {
  const pattern = new RegExp(`^(\\s*(?:export\\s+)?${key})\\s*=.*$`, 'mu');

  if (pattern.test(contents)) {
    return contents.replace(pattern, `$1=${value}`);
  }

  const separator = contents === '' || contents.endsWith('\n') ? '' : '\n';

  return `${contents}${separator}${key}=${value}\n`;
}

/** Reads the template's `.env.example`, which a template is not required to ship. */
export async function readEnvExample(
  directory: string,
): Promise<string | undefined> {
  try {
    return await readFile(path.join(directory, '.env.example'), 'utf8');
  } catch {
    return undefined;
  }
}

/** Runtime state a hub writes as it runs; none of it belongs in version control. */
const GITIGNORE_ADDITIONS = [
  '',
  '# nb3 hub runtime state',
  `${HUB_STATE_DIR}/logs/`,
  `${HUB_STATE_DIR}/cache/`,
  `${HUB_STATE_DIR}/*.pid`,
  '',
].join('\n');

/**
 * Finishes a scaffolded hub: creates the directories it writes into and ignores what it writes there.
 *
 * `.nb3/logs` and `.nb3/cache` are created rather than committed because they are gitignored, and the hub expects them
 * to exist. `app-dist/` holds the built apps a hub serves and is created with a `.gitkeep` by the caller, which writes
 * it alongside the rest of the extra files.
 *
 * This mirrors what `nb3 hub create` does, so a hub is the same whichever command produced it.
 */
export async function finalizeHub(directory: string): Promise<void> {
  for (const relative of ['logs', 'cache']) {
    await mkdir(path.join(directory, HUB_STATE_DIR, relative), {
      recursive: true,
    });
  }

  await appendHubGitignore(directory);
}

/**
 * Appends the hub's runtime-state entries to the generated project's `.gitignore`.
 *
 * The file is created when the template shipped none, rather than skipping the ignore rules: `scaffoldFromTemplate`
 * guarantees a `.gitignore` exists, but writing it here as well keeps this function usable on its own.
 */
async function appendHubGitignore(directory: string): Promise<void> {
  const target = path.join(directory, '.gitignore');
  let existing = '';

  try {
    existing = await readFile(target, 'utf8');
  } catch {
    // No file yet; the additions below stand on their own.
  }

  if (existing.includes(`${HUB_STATE_DIR}/logs/`)) {
    return;
  }

  if (existing === '') {
    await writeFile(target, GITIGNORE_ADDITIONS.trimStart(), 'utf8');
    return;
  }

  await appendFile(target, GITIGNORE_ADDITIONS, 'utf8');
}
