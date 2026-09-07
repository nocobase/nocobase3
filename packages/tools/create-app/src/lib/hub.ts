import { readFile } from 'node:fs/promises';
import path from 'node:path';

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
