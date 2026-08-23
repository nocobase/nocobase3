import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizePluginName } from './create-plugin.mjs';
import {
  DEFAULT_APP,
  isRecord,
  parseJson,
  readOptionalFile,
  resolveApplication,
  restoreOptionalFile,
  synchronizeWorkspace,
} from './register-plugin.mjs';

const packagePrefix = '@nocobase/app-plugin-';
const scriptPath = fileURLToPath(import.meta.url);
const defaultRepoRoot = path.resolve(path.dirname(scriptPath), '..');

const help = `Unregister a NocoBase plugin from an application package.

Usage:
  pnpm plugin:unregister <name> [options]

Arguments:
  <name>            Short kebab-case name, for example audit-log
                    (full @nocobase/app-plugin-* names also work)

Options:
  --app <app>       Application directory or package name
                    (default: app-template-default)
  --no-install      Do not synchronize pnpm-lock.yaml
  --dry-run         Validate and print the change without writing
  -h, --help        Show this help

Examples:
  pnpm plugin:unregister audit-log
  pnpm plugin:unregister audit-log --app app-template-default
  pnpm plugin:unregister audit-log --app @nocobase/app-template-default`;

export function parseUnregisterPluginArgs(args) {
  const options = {
    app: DEFAULT_APP,
    dryRun: false,
    help: false,
    install: true,
    name: undefined,
  };
  const positionals = [];

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];

    if (argument === '--help' || argument === '-h') {
      options.help = true;
      continue;
    }
    if (argument === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (argument === '--no-install') {
      options.install = false;
      continue;
    }
    if (argument === '--app') {
      const value = args[index + 1];
      if (value === undefined || value.startsWith('-')) {
        throw new Error('--app requires a value.');
      }
      options.app = value;
      index += 1;
      continue;
    }
    if (argument.startsWith('-')) {
      throw new Error(`Unknown option: ${argument}`);
    }
    positionals.push(argument);
  }

  if (positionals.length > 1) {
    throw new Error('Expected exactly one plugin name.');
  }
  options.name = positionals[0];

  if (!options.help && options.name === undefined) {
    throw new Error('A plugin name is required.');
  }

  return options;
}

export async function unregisterPlugin({
  app = DEFAULT_APP,
  dryRun = false,
  install = true,
  name,
  repoRoot = defaultRepoRoot,
  synchronize = synchronizeWorkspace,
}) {
  const shortName = normalizePluginName(name);
  const packageName = `${packagePrefix}${shortName}`;
  const resolvedRepoRoot = path.resolve(repoRoot);
  const application = await resolveApplication(resolvedRepoRoot, app);
  const originalApplicationContents = await readFile(
    application.packageJsonPath,
    'utf8',
  );
  const applicationPackage = parseJson(
    originalApplicationContents,
    application.packageJsonPath,
  );
  const removedFrom = removePluginRegistration(
    applicationPackage,
    packageName,
    application.packageJsonPath,
  );
  const changed = removedFrom.length > 0;
  const result = {
    appPackageName: application.packageName,
    appPackagePath: application.packageJsonPath,
    changed,
    packageName,
    removedFrom,
    shortName,
  };

  if (dryRun || !changed) {
    return result;
  }

  const lockfilePath = path.join(resolvedRepoRoot, 'pnpm-lock.yaml');
  const lockfileSnapshot = install
    ? await readOptionalFile(lockfilePath)
    : undefined;
  await writeFile(
    application.packageJsonPath,
    `${JSON.stringify(applicationPackage, null, 2)}\n`,
  );

  if (!install) {
    return result;
  }

  try {
    synchronize(resolvedRepoRoot);
  } catch (error) {
    const recoveryErrors = [];
    try {
      await writeFile(application.packageJsonPath, originalApplicationContents);
    } catch (recoveryError) {
      recoveryErrors.push(recoveryError);
    }
    try {
      await restoreOptionalFile(lockfilePath, lockfileSnapshot);
    } catch (recoveryError) {
      recoveryErrors.push(recoveryError);
    }

    if (recoveryErrors.length > 0) {
      throw new AggregateError(
        [error, ...recoveryErrors],
        `Plugin unregistration failed and recovery was incomplete for ${application.packageJsonPath}.`,
        { cause: error },
      );
    }

    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Plugin unregistration failed and ${application.packageJsonPath} was restored: ${reason}`,
      { cause: error },
    );
  }

  return result;
}

function removePluginRegistration(
  applicationPackage,
  packageName,
  packageJsonPath,
) {
  const removedFrom = [];
  const devDependencies = applicationPackage.devDependencies;
  if (devDependencies !== undefined && !isRecord(devDependencies)) {
    throw new Error(
      `${packageJsonPath} must define devDependencies as an object.`,
    );
  }
  if (
    devDependencies !== undefined &&
    Object.prototype.hasOwnProperty.call(devDependencies, packageName)
  ) {
    delete devDependencies[packageName];
    removedFrom.push('devDependencies');
  }

  const nocobase = applicationPackage.nocobase;
  if (nocobase !== undefined && !isRecord(nocobase)) {
    throw new Error(`${packageJsonPath} must define nocobase as an object.`);
  }
  const plugins = nocobase?.plugins;
  if (plugins !== undefined && !isRecord(plugins)) {
    throw new Error(
      `${packageJsonPath} must define nocobase.plugins as an object.`,
    );
  }
  if (
    plugins !== undefined &&
    Object.prototype.hasOwnProperty.call(plugins, packageName)
  ) {
    delete plugins[packageName];
    removedFrom.push('nocobase.plugins');
  }

  return removedFrom;
}

async function main() {
  try {
    const options = parseUnregisterPluginArgs(process.argv.slice(2));
    if (options.help) {
      console.log(help);
      return;
    }

    const result = await unregisterPlugin(options);
    if (options.dryRun) {
      console.log(
        result.changed
          ? `Would unregister ${result.packageName} from ${result.appPackageName} (${result.removedFrom.join(', ')})`
          : `${result.packageName} is not registered in ${result.appPackageName}`,
      );
      return;
    }
    if (!result.changed) {
      console.log(
        `${result.packageName} is not registered in ${result.appPackageName}`,
      );
      return;
    }

    console.log(
      `Unregistered ${result.packageName} from ${result.appPackageName} (${result.removedFrom.join(', ')})`,
    );
    if (!options.install) {
      console.log(
        'Skipped dependency installation. Run CI=true pnpm install --no-frozen-lockfile before committing.',
      );
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    console.error('Run pnpm plugin:unregister --help for usage.');
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] && path.resolve(process.argv[1]);
if (invokedPath === scriptPath) {
  await main();
}
