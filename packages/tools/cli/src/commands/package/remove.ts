import { Args, Flags } from '@oclif/core';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import PluginUnregister from '../plugin/unregister.ts';
import {
  appPackageManager,
  removeDependencyCommand,
} from '../../lib/plugin-install.ts';
import {
  classifyPluginError,
  pluginJsonFailure,
  pluginJsonSuccess,
} from '../../lib/plugin-json.ts';
import {
  CommandFailedError,
  runAttached,
  runCommand,
} from '../../lib/run-command.ts';
import {
  planPackageSkillRemovals,
  removePackageSkills,
} from '../../lib/skills-sync.ts';
import { resolveAppRoot } from '../../lib/workspace-app.ts';

const NOCOBASE_PACKAGE_PATTERN = /^@nocobase\/[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const PLUGIN_PACKAGE_PREFIX = '@nocobase/app-plugin-';
const DEPENDENCY_SECTIONS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
] as const;

type DependencySection = (typeof DEPENDENCY_SECTIONS)[number];

class PackageManagerRemovalError extends Error {
  public constructor(
    packageManager: string,
    packageName: string,
    cause?: unknown,
  ) {
    const detail =
      cause instanceof CommandFailedError && cause.stderr.length > 0
        ? ` ${cause.stderr}`
        : '';
    super(`${packageManager} could not remove ${packageName}.${detail}`, {
      cause,
    });
    this.name = 'PackageManagerRemovalError';
  }
}

export default class PackageRemove extends PluginUnregister {
  static override summary =
    'Remove a direct NocoBase package dependency and its synchronized skills.';
  static override description =
    'Removes a directly declared @nocobase/* dependency with the App package manager, then deletes only the skills recorded as belonging to that package. A package already absent from package.json still has stale recorded skills cleaned. Plugin packages also unregister their Client, Server, and CLI contributions.';

  static override examples = [
    '<%= config.bin %> <%= command.id %> @nocobase/app-skills',
    '<%= config.bin %> <%= command.id %> @nocobase/app-plugin-workflow',
    '<%= config.bin %> <%= command.id %> @nocobase/app-skills --dry-run',
    '<%= config.bin %> <%= command.id %> @nocobase/app-skills --workspace-root . --app app-template-default',
  ];

  static override args = {
    name: Args.string({
      description: 'Full @nocobase/* package name to remove.',
      required: true,
    }),
  };

  static override flags = {
    dir: Flags.string({
      description: 'App directory. Defaults to the current directory.',
    }),
    app: Flags.string({
      description:
        'Workspace app directory or package name. Requires --workspace-root.',
    }),
    'workspace-root': Flags.string({
      description:
        'Monorepo root. Selects app-template-default unless --app is provided.',
    }),
    'dry-run': Flags.boolean({
      default: false,
      description: 'Print what would change without writing anything.',
    }),
    json: Flags.boolean({
      default: false,
      description: 'Print one machine-readable JSON result.',
    }),
  };

  protected override readonly operation = 'package:remove';

  public override async run(): Promise<void> {
    try {
      await this.runPackageRemove();
    } catch (error) {
      if (!this.argv.includes('--json')) throw error;
      const classified =
        error instanceof PackageManagerRemovalError
          ? {
              code: 'PACKAGE_MANAGER_FAILED',
              message: error.message,
              suggestions: [
                'Fix the package manager error, then run package:remove again.',
              ],
            }
          : classifyPluginError(error);
      this.logToStderr(
        JSON.stringify(pluginJsonFailure(this.operation, classified), null, 2),
      );
      process.exitCode = 1;
    }
  }

  private async runPackageRemove(): Promise<void> {
    const { args, flags } = await this.parse(PackageRemove);
    const packageName = normalizePackageName(args.name);
    const appRoot = await resolveAppRoot({
      app: flags.app,
      dir: flags.dir,
      workspaceRoot: flags['workspace-root'],
    });
    const dependencySections = await readDependencySections(
      appRoot,
      packageName,
    );

    if (packageName.startsWith(PLUGIN_PACKAGE_PREFIX)) {
      await this.unregisterPlugin(packageName, {
        app: flags.app,
        dependencySections,
        dir: flags.dir,
        dryRun: flags['dry-run'],
        json: flags.json,
        noInstall: dependencySections.length === 0,
        workspaceRoot: flags['workspace-root'],
      });
      return;
    }

    const skillRemovals = await planPackageSkillRemovals(appRoot, packageName);
    const packageManager =
      dependencySections.length === 0
        ? undefined
        : await appPackageManager(appRoot);
    const invocation =
      packageManager === undefined
        ? undefined
        : removeDependencyCommand(packageManager, packageName);
    const commands =
      invocation === undefined
        ? []
        : [
            {
              command: invocation.packageManager,
              args: invocation.args,
              cwd: appRoot,
            },
          ];

    if (flags['dry-run']) {
      if (flags.json) {
        this.logJson(
          pluginJsonSuccess(
            this.operation,
            dependencySections.length === 0 && skillRemovals.length === 0
              ? 'success-noop'
              : 'success',
            {
              mode: 'dry-run',
              appRoot,
              packageName,
              dependencySections,
              skillRemovals,
              commands,
            },
          ),
        );
      } else if (
        dependencySections.length === 0 &&
        skillRemovals.length === 0
      ) {
        this.log(
          `${packageName} is not declared in this app and has no synchronized skills.`,
        );
      } else {
        this.log(`Would remove ${packageName}.`);
        for (const command of commands) {
          this.log(`  ${command.command} ${command.args.join(' ')}`);
        }
        for (const skill of skillRemovals) {
          this.log(`  would remove skill ${skill}`);
        }
      }
      return;
    }

    if (invocation !== undefined) {
      if (!flags.json) {
        this.log(`${invocation.packageManager} ${invocation.args.join(' ')}`);
      }
      try {
        if (flags.json) {
          await runCommand(invocation.packageManager, [...invocation.args], {
            cwd: appRoot,
          });
        } else {
          const exitCode = await runAttached(
            invocation.packageManager,
            [...invocation.args],
            { cwd: appRoot },
          );
          if (exitCode !== 0) {
            throw new PackageManagerRemovalError(
              invocation.packageManager,
              packageName,
            );
          }
        }
      } catch (error) {
        if (error instanceof PackageManagerRemovalError) throw error;
        throw new PackageManagerRemovalError(
          invocation.packageManager,
          packageName,
          error,
        );
      }

      const remainingSections = await readDependencySections(
        appRoot,
        packageName,
      );
      if (remainingSections.length > 0) {
        throw new PackageManagerRemovalError(
          invocation.packageManager,
          packageName,
        );
      }
    }

    const removedSkills = await removePackageSkills(appRoot, packageName);
    const status =
      dependencySections.length === 0 && removedSkills.length === 0
        ? 'success-noop'
        : 'success';
    if (flags.json) {
      this.logJson(
        pluginJsonSuccess(this.operation, status, {
          mode: 'remove',
          appRoot,
          packageName,
          removedFrom: dependencySections,
          removedSkills,
          commands,
        }),
      );
      return;
    }
    if (status === 'success-noop') {
      this.log(
        `${packageName} is not declared in this app and has no synchronized skills.`,
      );
      return;
    }
    this.log(`Removed ${packageName}.`);
    for (const skill of removedSkills) {
      this.log(`  removed skill ${skill}`);
    }
  }
}

function normalizePackageName(packageName: string): string {
  const normalized = packageName.trim();
  if (!NOCOBASE_PACKAGE_PATTERN.test(normalized)) {
    throw new Error(
      `Package name must be a full @nocobase/* package name, found ${packageName}.`,
    );
  }
  return normalized;
}

async function readDependencySections(
  appRoot: string,
  packageName: string,
): Promise<DependencySection[]> {
  const manifestPath = path.join(appRoot, 'package.json');
  let manifest: unknown;
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as unknown;
  } catch (error) {
    throw new Error(`Invalid package manifest: ${manifestPath}`, {
      cause: error,
    });
  }
  if (!isRecord(manifest)) {
    throw new Error(`${manifestPath} must contain a JSON object.`);
  }

  const sections: DependencySection[] = [];
  for (const section of DEPENDENCY_SECTIONS) {
    const dependencies = manifest[section];
    if (dependencies === undefined) continue;
    if (!isRecord(dependencies)) {
      throw new Error(`${manifestPath} must define ${section} as an object.`);
    }
    if (Object.prototype.hasOwnProperty.call(dependencies, packageName)) {
      sections.push(section);
    }
  }
  return sections;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
