import { Args, Command, Flags } from '@oclif/core';
import path from 'node:path';

import {
  addDependencyCommand,
  appPackageManager,
  declaredDependencyRange,
  installedPluginDirectory,
  installedPluginVersion,
} from '../../../lib/plugin-install.ts';
import type { ManualClientPluginEdit } from '../../../lib/client-plugins.ts';
import {
  applyPluginRegistration,
  planPluginRegistration,
  pluginPackageName,
} from '../../../lib/plugin-registration.ts';
import { runAttached } from '../../../lib/run-command.ts';
import {
  applySkillsSync,
  formatSkillsSyncSummary,
  planSkillsSync,
} from '../../../lib/skills-sync.ts';

export default class AppPluginRegister extends Command {
  static override summary = 'Install a plugin and wire it into this app.';
  static override description =
    'Adds the plugin package as a dependency, registers it under nocobase.plugins, imports it in client/plugins.ts, and copies the skills it ships into .agents/skills. A plugin that ships no ./client/plugin export is server-only, so the client entry is skipped rather than written as an import that cannot resolve.';

  static override examples = [
    '<%= config.bin %> <%= command.id %> audit-log',
    '<%= config.bin %> <%= command.id %> @nocobase/app-plugin-audit-log',
    '<%= config.bin %> <%= command.id %> audit-log --version 1.2.0',
    '<%= config.bin %> <%= command.id %> audit-log --dry-run',
  ];

  static override args = {
    name: Args.string({
      description:
        'Plugin to register: a short name such as audit-log, or a full @nocobase/app-plugin-* package name.',
      required: true,
    }),
  };

  static override flags = {
    dir: Flags.string({
      description: 'App directory. Defaults to the current directory.',
    }),
    version: Flags.string({
      description:
        'Version range to install. Defaults to the latest published version.',
    }),
    disabled: Flags.boolean({
      default: false,
      description:
        'Register the plugin with enabled set to false, leaving the client entry unwired.',
    }),
    'no-install': Flags.boolean({
      default: false,
      description:
        'Do not run the package manager; the plugin must already be installed.',
    }),
    'no-skills': Flags.boolean({
      default: false,
      description: "Do not copy the plugin's skills into this app.",
    }),
    'dry-run': Flags.boolean({
      default: false,
      description: 'Print what would change without writing anything.',
    }),
  };

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(AppPluginRegister);
    const appRoot = path.resolve(flags.dir ?? process.cwd());
    const dryRun = flags['dry-run'];
    const packageName = pluginPackageName(args.name);

    const installed = await this.install({
      appRoot,
      dryRun,
      packageName,
      skipInstall: flags['no-install'],
      version: flags.version,
    });
    if (installed === undefined) {
      return;
    }

    const plan = await planPluginRegistration({
      appRoot,
      dependencyRange: await this.dependencyRange(appRoot, packageName),
      enabled: !flags.disabled,
      packageName,
      pluginDirectory: installed,
    });

    if (!plan.changed) {
      this.log(`${packageName} is already registered.`);
      return;
    }
    if (dryRun) {
      this.log(this.describe(plan, appRoot, true));
      return;
    }

    await applyPluginRegistration(appRoot, plan);
    this.log(this.describe(plan, appRoot, false));

    if (flags['no-skills']) {
      return;
    }
    // Skills are documentation: a failure here is reported but never undoes a registration that already succeeded.
    try {
      const synced = await applySkillsSync(
        await planSkillsSync({
          appPackageName: packageName,
          appRoot,
          plugins: [{ packageName, pluginDirectory: installed }],
        }),
      );
      if (synced.copies.length > 0 || synced.removals.length > 0) {
        this.log(formatSkillsSyncSummary(synced));
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.warn(
        `${packageName} was registered, but its skills were not copied: ${reason}`,
      );
    }
  }

  /**
   * The range to record in the manifest. After an install the package manager has already written one, so it wins;
   * otherwise the installed version supplies a caret range. A package with no readable version records `*`, which is
   * honest about not knowing rather than inventing a range the registry would reject.
   */
  private async dependencyRange(
    appRoot: string,
    packageName: string,
  ): Promise<string> {
    const declared = await declaredDependencyRange(appRoot, packageName);
    if (declared !== undefined) {
      return declared;
    }
    const version = await installedPluginVersion(appRoot, packageName);
    return version === undefined ? '*' : `^${version}`;
  }

  /** Ensures the package is present, returning where it lives, or undefined when the run should stop. */
  private async install({
    appRoot,
    dryRun,
    packageName,
    skipInstall,
    version,
  }: {
    appRoot: string;
    dryRun: boolean;
    packageName: string;
    skipInstall: boolean;
    version?: string;
  }): Promise<string | undefined> {
    const existing = await installedPluginDirectory(appRoot, packageName);
    if (skipInstall) {
      if (existing === undefined) {
        this.error(
          `${packageName} is not installed in ${appRoot} and --no-install was given.`,
          { exit: 1 },
        );
      }
      return existing;
    }

    const specifier =
      version === undefined ? packageName : `${packageName}@${version}`;
    const { args, packageManager } = addDependencyCommand(
      await appPackageManager(appRoot),
      specifier,
    );

    if (dryRun) {
      // Without the package there is nothing to inspect, so a dry run reports the install and stops rather than
      // guessing at edits it cannot compute.
      if (existing === undefined) {
        this.log(
          `Would run: ${packageManager} ${args.join(' ')}\nThen register ${packageName}.`,
        );
        return undefined;
      }
      return existing;
    }

    this.log(`${packageManager} ${args.join(' ')}`);
    const exitCode = await runAttached(packageManager, [...args], {
      cwd: appRoot,
    });
    if (exitCode !== 0) {
      this.error(
        `${packageManager} exited with code ${exitCode}. Nothing was registered.`,
        { exit: exitCode === 0 ? 1 : exitCode },
      );
    }

    const directory = await installedPluginDirectory(appRoot, packageName);
    if (directory === undefined) {
      this.error(
        `${packageManager} reported success but ${packageName} is not in node_modules.`,
        { exit: 1 },
      );
    }
    return directory;
  }

  private describe(
    plan: Awaited<ReturnType<typeof planPluginRegistration>>,
    appRoot: string,
    dryRun: boolean,
  ): string {
    const lines = [
      `${dryRun ? 'Would register' : 'Registered'} ${plan.packageName} as ${plan.enabled ? 'enabled' : 'disabled'}`,
    ];
    if (plan.manifestChanged) {
      lines.push('  package.json: dependency and nocobase.plugins');
    }
    if (plan.clientPluginsChanged) {
      lines.push(
        `  ${path.relative(appRoot, plan.clientPluginsPath)}: import and registration`,
      );
    }
    if (plan.skippedClientEntry === 'no-client-entry') {
      lines.push(
        '  client/plugins.ts: skipped, this plugin ships no client entry',
      );
    }
    if (plan.skippedClientEntry === 'disabled') {
      lines.push('  client/plugins.ts: skipped, the plugin is disabled');
    }
    if (plan.manualClientEdit) {
      lines.push(
        ...manualEditInstructions(plan.manualClientEdit, appRoot, dryRun),
      );
    }
    return lines.join('\n');
  }
}

/**
 * Spells out the edit that could not be applied. The wording is deliberately literal — file, both lines, and where
 * each one goes — because the reader may be an agent with no view of the file, and "add the plugin to your client
 * entry" is not something it can act on.
 */
function manualEditInstructions(
  edit: ManualClientPluginEdit,
  appRoot: string,
  dryRun: boolean,
): string[] {
  const relativePath = path.relative(appRoot, edit.filePath);
  return [
    `  ${relativePath}: not edited, TypeScript is not installed in this app`,
    '',
    dryRun
      ? `Everything else would be done. ${relativePath} would need two lines added by hand:`
      : `Everything else is done. Add these two lines to ${relativePath} by hand:`,
    `  1. after the existing imports:  ${edit.importStatement}`,
    `  2. inside defineClientPlugins([...]):  ${edit.entry}`,
    '',
    'Or install TypeScript and re-run this command to have it written for you:',
    '  pnpm add -D typescript',
  ];
}
