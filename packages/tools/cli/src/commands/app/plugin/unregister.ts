import { Args, Command, Flags } from '@oclif/core';
import path from 'node:path';

import {
  appPackageManager,
  removeDependencyCommand,
} from '../../../lib/plugin-install.ts';
import {
  applyPluginRegistration,
  planPluginUnregistration,
  planPluginSkillRemovals,
  pluginPackageName,
  removePluginSkills,
} from '../../../lib/plugin-registration.ts';
import { runAttached } from '../../../lib/run-command.ts';
import {
  classifyPluginError,
  pluginJsonFailure,
  pluginPlanForJson,
  pluginJsonSuccess,
} from '../../../lib/plugin-json.ts';
import { runCommand } from '../../../lib/run-command.ts';
import { resolveAppRoot } from '../../../lib/workspace-app.ts';

export default class AppPluginUnregister extends Command {
  static override summary = 'Remove a plugin from this app.';
  static override description =
    'Undoes what register did: drops the imports and entries from the client and server composition roots, removes the nocobase.plugins registration and dependency, deletes installed skills, and uninstalls the package.';

  static override examples = [
    '<%= config.bin %> <%= command.id %> audit-log',
    '<%= config.bin %> <%= command.id %> @nocobase/app-plugin-audit-log',
    '<%= config.bin %> <%= command.id %> audit-log --dry-run',
    '<%= config.bin %> <%= command.id %> audit-log --workspace-root . --app app-template-default',
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
    app: Flags.string({
      description:
        'Workspace app directory or package name. Requires --workspace-root.',
    }),
    'workspace-root': Flags.string({
      description:
        'Monorepo root. Selects app-template-default unless --app is provided.',
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
    json: Flags.boolean({
      default: false,
      description: 'Print one machine-readable JSON result.',
    }),
  };

  public async run(): Promise<void> {
    try {
      await this.runUnsafe();
    } catch (error) {
      if (!this.argv.includes('--json')) throw error;
      this.logToStderr(
        JSON.stringify(
          pluginJsonFailure('plugin:unregister', classifyPluginError(error)),
          null,
          2,
        ),
      );
      process.exitCode = 1;
    }
  }

  private async runUnsafe(): Promise<void> {
    const { args, flags } = await this.parse(AppPluginUnregister);
    const appRoot = await resolveAppRoot({
      app: flags.app,
      dir: flags.dir,
      workspaceRoot: flags['workspace-root'],
    });
    const dryRun = flags['dry-run'];
    const packageName = pluginPackageName(args.name);

    const plan = await planPluginUnregistration({ appRoot, packageName });
    const skillRemovals = await planPluginSkillRemovals(appRoot, packageName);
    if (!plan.changed && skillRemovals.length === 0) {
      if (flags.json) {
        this.logJson(
          pluginJsonSuccess('plugin:unregister', 'success-noop', {
            appRoot,
            packageName,
            removedFrom: [],
            skillRemovals,
          }),
        );
      } else {
        this.log(`${packageName} is not registered in this app.`);
      }
      return;
    }
    if (dryRun) {
      if (flags.json) {
        const packageManager = flags['no-install']
          ? undefined
          : await appPackageManager(appRoot);
        this.logJson(
          pluginJsonSuccess(
            'plugin:unregister',
            plan.manualClientEdit || plan.manualServerEdit
              ? 'partial-success'
              : 'success',
            {
              mode: 'dry-run',
              appRoot,
              packageName,
              plan: pluginPlanForJson(plan),
              skillRemovals,
              commands:
                flags['no-install'] || !plan.changed
                  ? []
                  : [
                      {
                        command: packageManager!,
                        args: removeDependencyCommand(
                          packageManager!,
                          packageName,
                        ).args,
                        cwd: appRoot,
                      },
                    ],
            },
          ),
        );
      } else {
        this.log(
          `Would unregister ${packageName} (${plan.removedFrom.join(', ')})`,
        );
      }
      return;
    }

    // Skills are copied out of the installed package, so they have to go before the package does. The package manager
    // runs before the manifest is rewritten, because removing the dependency first leaves it nothing to remove and
    // `pnpm remove` fails outright on a package it cannot find.
    const removedSkills = await removePluginSkills(appRoot, packageName);

    let packageManagerFailed = false;
    if (!flags['no-install'] && plan.changed) {
      const { args: commandArgs, packageManager } = removeDependencyCommand(
        await appPackageManager(appRoot),
        packageName,
      );
      if (!flags.json) this.log(`${packageManager} ${commandArgs.join(' ')}`);
      let exitCode = 0;
      if (flags.json) {
        try {
          await runCommand(packageManager, [...commandArgs], { cwd: appRoot });
        } catch {
          exitCode = 1;
          packageManagerFailed = true;
        }
      } else {
        exitCode = await runAttached(packageManager, [...commandArgs], {
          cwd: appRoot,
        });
      }
      if (exitCode !== 0) {
        if (!flags.json)
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
    if (flags.json) {
      this.logJson(
        pluginJsonSuccess(
          'plugin:unregister',
          packageManagerFailed ||
            finalPlan.manualClientEdit ||
            finalPlan.manualServerEdit
            ? 'partial-success'
            : 'success',
          {
            mode: 'unregister',
            appRoot,
            packageName,
            removedFrom,
            removedSkills,
            plan: pluginPlanForJson(finalPlan),
            ...(packageManagerFailed
              ? {
                  issues: [
                    {
                      code: 'PACKAGE_MANAGER_FAILED',
                      message:
                        'The plugin was unregistered, but the package manager did not remove the installed dependency.',
                      suggestions: [
                        'Remove the package dependency manually and reinstall dependencies.',
                      ],
                    },
                  ],
                }
              : {}),
          },
        ),
      );
      return;
    }
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
    if (finalPlan.manualServerEdit) {
      this.log(
        `\n${path.relative(appRoot, finalPlan.manualServerEdit.filePath)} still imports this plugin and could not be edited: TypeScript is not installed in this app.`,
      );
      this.log('Remove these two lines by hand:');
      this.log(`  1. ${finalPlan.manualServerEdit.importStatement}`);
      this.log(`  2. ${finalPlan.manualServerEdit.entry}`);
    }
  }
}
