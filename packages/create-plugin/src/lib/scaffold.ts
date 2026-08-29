import { constants } from 'node:fs';
import { access, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

import type { WorkspaceSynchronizer } from './install.ts';
import { synchronizeWorkspace } from './install.ts';
import { createPluginNames, toTitleCase } from './names.ts';
import {
  DEFAULT_TEMPLATE_DIRECTORY,
  listTemplateFiles,
  renderTemplate,
  type PluginTemplateContext,
} from './template.ts';

export interface CreatePluginOptions {
  readonly description?: string;
  readonly displayName?: string;
  readonly dryRun?: boolean;
  readonly install?: boolean;
  readonly name: string;
  readonly now?: Date;
  readonly repoRoot?: string;
  readonly synchronize?: WorkspaceSynchronizer;
  readonly templateDirectory?: string;
}

export interface CreatePluginResult {
  readonly directoryName: string;
  readonly files: readonly string[];
  readonly packageName: string;
  readonly shortName: string;
  readonly targetDirectory: string;
}

function validateTextOption(value: string, option: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new Error(`${option} cannot be empty.`);
  }
  if (/\r|\n/u.test(normalized)) {
    throw new Error(`${option} must be a single line.`);
  }
  return normalized;
}

export function formatDatePrefix(value: Date): string {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error('The scaffold date must be a valid Date.');
  }

  return [value.getFullYear(), value.getMonth() + 1, value.getDate()]
    .map((part, index) => String(part).padStart(index === 0 ? 4 : 2, '0'))
    .join('');
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

export async function createPlugin(
  options: CreatePluginOptions,
): Promise<CreatePluginResult> {
  const names = createPluginNames(options.name);
  const resolvedRepoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const packagesDirectory = path.join(resolvedRepoRoot, 'packages');
  const targetDirectory = path.join(packagesDirectory, names.directoryName);
  const displayName = validateTextOption(
    options.displayName ?? `${toTitleCase(names.shortName)} App Plugin`,
    '--display-name',
  );
  const description = validateTextOption(
    options.description ?? `${displayName}.`,
    '--description',
  );
  const datePrefix = formatDatePrefix(options.now ?? new Date());
  const snakeName = names.shortName.replaceAll('-', '_');
  const context: PluginTemplateContext = {
    ...names,
    datePrefix,
    description,
    displayName,
    migrationName: `${datePrefix}0001_${snakeName}_create_records`,
    seedName: `${datePrefix}0002_${snakeName}_create_welcome_record`,
  };
  const templateDirectory =
    options.templateDirectory ?? DEFAULT_TEMPLATE_DIRECTORY;

  await access(packagesDirectory, constants.W_OK);
  if (await pathExists(targetDirectory)) {
    throw new Error(`Target already exists: ${targetDirectory}`);
  }

  const files = await listTemplateFiles(templateDirectory, context);
  const result: CreatePluginResult = {
    directoryName: names.directoryName,
    files,
    packageName: names.packageName,
    shortName: names.shortName,
    targetDirectory,
  };
  if (options.dryRun) {
    return result;
  }

  let targetCreated = false;
  try {
    await mkdir(targetDirectory);
    targetCreated = true;
    await renderTemplate({ context, targetDirectory, templateDirectory });
  } catch (error) {
    if (targetCreated) {
      await rm(targetDirectory, { force: true, recursive: true });
    }
    throw error;
  }

  if (options.install ?? true) {
    (options.synchronize ?? synchronizeWorkspace)(
      resolvedRepoRoot,
      targetDirectory,
    );
  }

  return result;
}
