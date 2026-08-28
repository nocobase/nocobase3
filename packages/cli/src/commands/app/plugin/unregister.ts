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

    await applyPluginRegistration(appRoot, plan);
    const removedSkills = await removePluginSkills(appRoot, packageName);
    this.log(`Unregistered ${packageName} (${plan.removedFrom.join(', ')})`);
    for (const skill of removedSkills) {
      this.log(`  removed skill ${skill}`);
    }

    if (flags['no-install']) {
      return;
    }

    const { args: commandArgs, packageManager } = removeDependencyCommand(
      await appPackageManager(appRoot),
      packageName,
    );
    this.log(`${packageManager} ${commandArgs.join(' ')}`);
    const exitCode = await runAttached(packageManager, [...commandArgs], {
      cwd: appRoot,
    });
    if (exitCode !== 0) {
      // The registration is already gone, so this is a leftover package rather than a failed unregistration.
      this.warn(
        `${packageName} was unregistered, but ${packageManager} exited with code ${exitCode}; the package is still installed.`,
      );
    }
  }
}
