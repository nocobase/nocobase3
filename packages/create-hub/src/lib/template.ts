import { access, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { CommandFailedError, runCommand } from './run-command.ts';

export const DEFAULT_REGISTRY = 'https://npm.nocobase.ai';
export const DEFAULT_HUB_TEMPLATE = '@nocobase/hub@latest';

const PACK_TIMEOUT_MS = 5 * 60 * 1000;

export interface ResolvedTemplate {
  directory: string;
  name: string;
  version: string;
}

export interface DownloadTemplateOptions {
  source: string;
  registry?: string;
}

export function isLocalTemplateSource(source: string): boolean {
  return (
    source.startsWith('.') ||
    source.startsWith('/') ||
    source.startsWith('~') ||
    /^[A-Za-z]:[\\/]/u.test(source)
  );
}

function resolveLocalSource(source: string): string {
  if (source === '~') return os.homedir();
  if (source.startsWith('~/') || source.startsWith('~\\')) {
    return path.join(os.homedir(), source.slice(2));
  }
  return path.resolve(source);
}

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
      `Packing the Hub package produced no tarball in ${directory}.`,
    );
  }

  return path.join(directory, tarball);
}

async function readTemplateManifest(
  directory: string,
): Promise<{ name: string; version: string }> {
  let raw: string;
  try {
    raw = await readFile(path.join(directory, 'package.json'), 'utf8');
  } catch {
    throw new Error(
      'The Hub package has no package.json, so it cannot be scaffolded.',
    );
  }

  const manifest = JSON.parse(raw) as { name?: string; version?: string };
  try {
    await access(path.join(directory, 'server', 'standalone.js'));
  } catch {
    throw new Error(
      'The selected package has no server/standalone.js standalone Hub entry.',
    );
  }

  return {
    name: manifest.name ?? 'unknown',
    version: manifest.version ?? '0.0.0',
  };
}

export async function downloadTemplate(
  options: DownloadTemplateOptions,
): Promise<ResolvedTemplate> {
  const { source } = options;
  const packDirectory = await mkdtemp(
    path.join(os.tmpdir(), 'nocobase-hub-pack-'),
  );
  const extractDirectory = await mkdtemp(
    path.join(os.tmpdir(), 'nocobase-hub-template-'),
  );
  const packer = packerFor(source);

  try {
    const tarballPath = path.join(packDirectory, 'hub.tgz');
    const args = packer.args(tarballPath);
    if (options.registry && !isLocalTemplateSource(source)) {
      args.push(`--registry=${options.registry}`);
    }

    await runCommand(packer.command, args, {
      cwd: isLocalTemplateSource(source)
        ? resolveLocalSource(source)
        : packDirectory,
      timeoutMs: PACK_TIMEOUT_MS,
    });

    const tarball = isLocalTemplateSource(source)
      ? tarballPath
      : await findTarball(packDirectory);
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
        `Could not download the Hub package "${source}".\n${error.stderr || error.message}`,
        { cause: error },
      );
    }
    throw error;
  } finally {
    await rm(packDirectory, { force: true, recursive: true });
  }
}
