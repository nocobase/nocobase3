import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { CommandFailedError, runCommand } from './run-command.ts';

/**
 * v3 packages are published to the self-hosted registry rather than the public npm, and `@beta` is the only channel
 * carrying v3 releases so far. Switch to a stable range once the first stable version ships.
 *
 * Note this is the registry the *template* is downloaded from. It is unrelated to the registry that served this
 * package itself, which `pnpm create` resolves before any of this code runs.
 */
export const DEFAULT_REGISTRY = 'https://npm.nocobase.ai';

/**
 * Templates that can be named instead of spelled out as a package. A short name is what people will reach for, and it
 * keeps the published package name and its channel an implementation detail — repointing `default` at another channel
 * or another package then costs nothing on the command line.
 *
 * `default` tracks `latest` rather than `beta`. changesets leaves the `beta` dist-tag on a package's first published
 * version while every release since is only tagged `latest`: it treats a package whose versions are all prereleases as
 * publishing for the first time, so it tags `latest` to keep the package installable. That condition holds on every
 * release until a stable version ships, so `beta` points at the oldest template rather than the newest, and pointing
 * `default` there would hand everyone a stale template. `latest` is the newest published version today, and the right
 * thing to scaffold from once stable versions exist.
 *
 * More templates are expected here. Add an entry rather than asking anyone to type the package specifier.
 */
export const TEMPLATE_ALIASES: Readonly<Record<string, string>> = {
  default: '@nocobase/app-template-default@latest',
};

export const DEFAULT_TEMPLATE = 'default';

/**
 * Resolves what `--template` was given into something `downloadTemplate` can fetch.
 *
 * A known name maps to its package. Anything else passes through untouched, so a package specifier or a local path
 * still works — an alias table that swallowed those would make the flag less capable than it was.
 */
export function resolveTemplateSource(template: string): string {
  const name = template.trim();

  return TEMPLATE_ALIASES[name] ?? name;
}

export function isTemplateAlias(template: string): boolean {
  return Object.hasOwn(TEMPLATE_ALIASES, template.trim());
}

const PACK_TIMEOUT_MS = 5 * 60 * 1000;

export interface ResolvedTemplate {
  /** Directory holding the extracted template. The caller owns it and is responsible for cleanup. */
  directory: string;
  name: string;
  version: string;
}

export interface DownloadTemplateOptions {
  /** A published package (`pkg`, `pkg@1.2.3`) or a path to a local package directory. */
  source: string;
  registry?: string;
}

/**
 * A source is treated as a local directory when it looks like a path. Package names never start with `.` or a
 * separator, and only a path can be absolute, so the two cases stay unambiguous without touching the filesystem.
 */
export function isLocalTemplateSource(source: string): boolean {
  return (
    source.startsWith('.') ||
    source.startsWith('/') ||
    source.startsWith('~') ||
    /^[A-Za-z]:[\\/]/u.test(source)
  );
}

/**
 * `npm pack` rewrites nothing, while `pnpm pack` resolves pnpm's own `workspace:` and `catalog:` protocols into real
 * version ranges. A template packed from a workspace checkout therefore has to go through pnpm, or the generated
 * project would carry protocols that npm cannot install.
 */
function packerFor(source: string): {
  command: string;
  args: (destination: string) => string[];
} {
  if (isLocalTemplateSource(source)) {
    return {
      command: 'pnpm',
      args: (destination) => ['pack', '--out', destination],
    };
  }

  return {
    command: 'npm',
    args: () => ['pack', '--silent', source],
  };
}

async function findTarball(directory: string): Promise<string> {
  const entries = await readdir(directory);
  const tarball = entries.find((entry) => entry.endsWith('.tgz'));

  if (!tarball) {
    throw new Error(
      `Packing the template produced no tarball in ${directory}.`,
    );
  }

  return path.join(directory, tarball);
}

async function readTemplateManifest(
  directory: string,
): Promise<{ name: string; version: string }> {
  const manifestPath = path.join(directory, 'package.json');
  let raw: string;

  try {
    raw = await readFile(manifestPath, 'utf8');
  } catch {
    throw new Error(
      'The template has no package.json, so it is not a valid app template.',
    );
  }

  const manifest = JSON.parse(raw) as { name?: string; version?: string };

  return {
    name: manifest.name ?? 'unknown',
    version: manifest.version ?? '0.0.0',
  };
}

/**
 * Downloads a template and extracts it into a temporary directory.
 *
 * Both a published package and a local directory are fetched by packing them into a tarball, which keeps the template
 * to exactly the files its `files` field publishes — a `git clone` would drag in the whole repository and leave the
 * workspace protocols unresolved.
 */
export async function downloadTemplate(
  options: DownloadTemplateOptions,
): Promise<ResolvedTemplate> {
  const { source } = options;
  const packDirectory = await mkdtemp(
    path.join(os.tmpdir(), 'nocobase-template-pack-'),
  );
  const extractDirectory = await mkdtemp(
    path.join(os.tmpdir(), 'nocobase-template-'),
  );
  const packer = packerFor(source);

  try {
    const tarballPath = path.join(packDirectory, 'template.tgz');
    const args = packer.args(tarballPath);

    if (options.registry && !isLocalTemplateSource(source)) {
      args.push(`--registry=${options.registry}`);
    }

    await runCommand(packer.command, args, {
      cwd: isLocalTemplateSource(source) ? path.resolve(source) : packDirectory,
      timeoutMs: PACK_TIMEOUT_MS,
    });

    const tarball = isLocalTemplateSource(source)
      ? tarballPath
      : await findTarball(packDirectory);

    // Every npm tarball wraps its contents in a single `package/` directory, which `--strip-components=1` removes.
    await runCommand(
      'tar',
      ['-xzf', tarball, '-C', extractDirectory, '--strip-components=1'],
      { timeoutMs: PACK_TIMEOUT_MS },
    );

    const manifest = await readTemplateManifest(extractDirectory);

    return { directory: extractDirectory, ...manifest };
  } catch (error) {
    await rm(extractDirectory, { force: true, recursive: true });

    if (error instanceof CommandFailedError) {
      throw new Error(
        `Could not download the template "${source}".\n${error.stderr || error.message}`,
        { cause: error },
      );
    }

    throw error;
  } finally {
    await rm(packDirectory, { force: true, recursive: true });
  }
}
