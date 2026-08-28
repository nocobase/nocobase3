import { Args, Command, Flags } from '@oclif/core';
import path from 'node:path';

import {
  appPackageManager,
  removeDependencyCommand,
} from '../../../lib/plugin-install.ts';
import {
  applyPluginRegistration,
  planPluginUnregistration,
  pluginPackageName,
  removePluginSkills,
} from '../../../lib/plugin-registration.ts';
import { runAttached } from '../../../lib/run-command.ts';

export default class AppPluginUnregister extends Command {
  static override summary = 'Remove a plugin from this app.';
  static override description =
    'Undoes what register did: drops the import and entry from client/plugins.ts, removes the nocobase.plugins registration and the dependency, deletes the skills the plugin installed, and uninstalls the package. The skill directories are deleted here because synchronization only ever writes the prefixes of registered plugins and so never cleans up after a removal.';

  static override examples = [
    '<%= config.bin %> <%= command.id %> audit-log',
    '<%= config.bin %> <%= command.id %> @nocobase/app-plugin-audit-log',
    '<%= config.bin %> <%= command.id %> audit-log --dry-run',
  ];

  static override args = {
    name: Args.string({
      description:
        'Plugin to remove: a short name such as audit-log, or a full @nocobase/app-plugin-* package name.',
      required: true,
    }),
  };

  static override flags = {
    dir: Flags.string({
      description: 'App directory. Defaults to the current directory.',
    }),
    'no-install': Flags.boolean({
      default: false,
      description:
        'Do not run the package manager; leave the package installed.',
    }),
    'dry-run': Flags.boolean({
      default: false,
      description: 'Print what would change without writing anything.',
    }),
  };

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(AppPluginUnregister);
    const appRoot = path.resolve(flags.dir ?? process.cwd());
    const dryRun = flags['dry-run'];
    const packageName = pluginPackageName(args.name);

    const plan = await planPluginUnregistration({ appRoot, packageName });
    if (!plan.changed) {
      this.log(`${packageName} is not registered in this app.`);
      return;
    }
    if (dryRun) {
      this.log(
        `Would unregister ${packageName} (${plan.removedFrom.join(', ')})`,
      );
      return;
    }

    // Skills are copied out of the installed package, so they have to go before the package does. The package manager
    // runs before the manifest is rewritten, because removing the dependency first leaves it nothing to remove and
    // `pnpm remove` fails outright on a package it cannot find.
    const removedSkills = await removePluginSkills(appRoot, packageName);

    if (!flags['no-install']) {
      const { args: commandArgs, packageManager } = removeDependencyCommand(
        await appPackageManager(appRoot),
        packageName,
      );
      this.log(`${packageManager} ${commandArgs.join(' ')}`);
      const exitCode = await runAttached(packageManager, [...commandArgs], {
        cwd: appRoot,
      });
      if (exitCode !== 0) {
        this.warn(
          `${packageManager} exited with code ${exitCode}; the package may still be installed. Continuing to unregister it.`,
        );
      }
    }

    // The package manager rewrites package.json itself, so the plan is recomputed against what it left behind rather
    // than overwriting that file with a manifest read before the removal.
    const finalPlan = await planPluginUnregistration({ appRoot, packageName });
    await applyPluginRegistration(appRoot, finalPlan);

    const removedFrom =
      finalPlan.removedFrom.length > 0
        ? finalPlan.removedFrom
        : plan.removedFrom;
    this.log(`Unregistered ${packageName} (${removedFrom.join(', ')})`);
    for (const skill of removedSkills) {
      this.log(`  removed skill ${skill}`);
    }
    if (finalPlan.manualClientEdit) {
      this.log(
        `\n${path.relative(appRoot, finalPlan.manualClientEdit.filePath)} still imports this plugin and could not be edited: TypeScript is not installed in this app.`,
      );
      this.log('Remove these two lines by hand:');
      this.log(`  1. ${finalPlan.manualClientEdit.importStatement}`);
      this.log(`  2. ${finalPlan.manualClientEdit.entry}`);
    }
  }
}
