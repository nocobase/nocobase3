import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { CommandFailedError, runCommand } from './run-command.ts';

/**
 * Neither v3 package is on npm yet, so both defaults point at the published v2 portal template for now. It is enough to
 * exercise the whole download-install-run path; only these constants change once the v3 packages ship.
 */
export const DEFAULT_TEMPLATE = '@nocobase/portal-template-default@3.1.1';

/** The hub is scaffolded the same way an app is: download a package, extract it, install, run. */
export const DEFAULT_HUB_TEMPLATE = '@nocobase/portal-template-default@3.1.1';

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
    /^[A-Za-z]:[\\/]/.test(source)
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
      `The template has no package.json, so it is not a valid app template.`,
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
    path.join(os.tmpdir(), 'nb3-template-pack-'),
  );
  const extractDirectory = await mkdtemp(
    path.join(os.tmpdir(), 'nb3-template-'),
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
      {
        timeoutMs: PACK_TIMEOUT_MS,
      },
    );

    const manifest = await readTemplateManifest(extractDirectory);
    return { directory: extractDirectory, ...manifest };
  } catch (error) {
    await rm(extractDirectory, { force: true, recursive: true });

    if (error instanceof CommandFailedError) {
      throw new Error(
        `Could not download the template "${source}".\n${error.stderr || error.message}`,
        {
          cause: error,
        },
      );
    }

    throw error;
  } finally {
    await rm(packDirectory, { force: true, recursive: true });
  }
}
