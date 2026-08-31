import { mkdir, symlink } from 'node:fs/promises';
import { dirname, relative } from 'node:path';
import { lstatSync, readlinkSync } from 'node:fs';

import type { AppDriveConfig } from './types.js';

export interface PrepareDriveStorageResult {
  directories: string[];
  links: Array<{
    link: string;
    target: string;
    status: 'created' | 'exists' | 'skipped';
  }>;
}

export interface PrepareDriveStorageOptions {
  createLinks?: boolean;
}

export async function prepareDriveStorage(
  config: AppDriveConfig,
  options: PrepareDriveStorageOptions = {},
): Promise<PrepareDriveStorageResult> {
  const directories = Array.from(
    new Set(
      Object.values(config.disks)
        .filter((disk) => disk.driver === 'fs')
        .map((disk) => disk.location),
    ),
  );

  for (const directory of directories) {
    await mkdir(directory, { recursive: true });
  }

  const links = [];
  const createLinks = options.createLinks ?? true;
  for (const [link, target] of Object.entries(config.links)) {
    await mkdir(dirname(link), { recursive: true });

    if (!createLinks) {
      links.push({ link, target, status: 'skipped' as const });
      continue;
    }

    if (isExpectedLink(link, target)) {
      links.push({ link, target, status: 'exists' as const });
      continue;
    }

    await symlink(relative(dirname(link), target), link, 'dir');
    links.push({ link, target, status: 'created' as const });
  }

  return { directories, links };
}

function isExpectedLink(link: string, target: string): boolean {
  try {
    const stat = lstatSync(link);
    if (!stat.isSymbolicLink()) {
      return false;
    }

    return readlinkSync(link) === relative(dirname(link), target);
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return false;
    }

    throw error;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return Boolean(error && typeof error === 'object' && 'code' in error);
}
