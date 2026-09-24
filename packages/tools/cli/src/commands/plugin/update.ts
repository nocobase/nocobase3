import { Args, Command, Flags } from '@oclif/core';
import path from 'node:path';

import { planPluginUpdate } from '../../lib/plugin-update.ts';
import { runAttached } from '../../lib/run-command.ts';
import {
  classifyPluginError,
  pluginJsonFailure,
  pluginJsonSuccess,
} from '../../lib/plugin-json.ts';
import { runCommand } from '../../lib/run-command.ts';
import {
  applySkillsSync,
  formatSkillsSyncSummary,
  planSkillsSync,
  resolveInstalledPlugins,
} from '../../lib/skills-sync.ts';

export default class PluginUpdate extends Command {
  static override summary = 'Upgrade plugins and re-synchronize their skills.';
  static override description =
    "Upgrades the plugin packages through the package manager the app already uses, then re-synchronizes all registered plugins' skills into .agents/skills. Specify a full package name or a short name. Without a name every registered plugin is upgraded. The skills copy is the reason to prefer this over upgrading by hand: skills live in the app, so an upgrade leaves a stale copy behind until something re-runs the sync.";

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> @nocobase/app-plugin-workflow',
    '<%= config.bin %> <%= command.id %> workflow',
    '<%= config.bin %> <%= command.id %> --dry-run',
  ];

  static override args = {
    name: Args.string({
      description:
        'Plugin to upgrade: a full @nocobase/app-plugin-* package name or a short name such as workflow. Omit to upgrade every registered plugin.',
      required: false,
    }),
  };

  static override flags = {
    dir: Flags.string({
      description: 'App directory. Defaults to the current directory.',
    }),
    'dry-run': Flags.boolean({
      default: false,
      description: 'Print what would run without upgrading anything.',
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
          pluginJsonFailure('plugin:update', classifyPluginError(error)),
          null,
          2,
        ),
      );
      process.exitCode = 1;
    }
  }

  private async runUnsafe(): Promise<void> {
    const { args, flags } = await this.parse(PluginUpdate);
    const appRoot = path.resolve(flags.dir ?? process.cwd());
    const dryRun = flags['dry-run'];

    const plan = await planPluginUpdate({
      appRoot,
      plugins: args.name === undefined ? [] : [args.name],
    });
    if (plan.packageNames.length === 0) {
      if (flags.json) {
        this.logJson(
          pluginJsonSuccess('plugin:update', 'success-noop', {
            appRoot,
            packageNames: [],
            commands: [],
          }),
        );
      } else {
        this.log('No plugins are registered in this app.');
      }
      return;
    }

    if (dryRun) {
      if (flags.json) {
        this.logJson(
          pluginJsonSuccess('plugin:update', 'success', {
            mode: 'dry-run',
            appRoot,
            ...plan,
            commands: [
              {
                command: plan.packageManager,
                args: plan.args,
                cwd: appRoot,
              },
            ],
            synchronizeSkills: plan.packageNames,
          }),
        );
      } else {
        this.log(
          `Would run: ${plan.packageManager} ${plan.args.join(' ')}\nThen synchronize the skills of: ${plan.packageNames.join(', ')}`,
        );
      }
      return;
    }

    if (!flags.json) this.log(`${plan.packageManager} ${plan.args.join(' ')}`);
    let exitCode = 0;
    if (flags.json) {
      await runCommand(plan.packageManager, [...plan.args], { cwd: appRoot });
    } else {
      exitCode = await runAttached(plan.packageManager, [...plan.args], {
        cwd: appRoot,
      });
    }
    if (exitCode !== 0) {
      this.error(
        `${plan.packageManager} exited with code ${exitCode}. The skills were left untouched.`,
        { exit: exitCode === null ? 1 : exitCode },
      );
    }

    // The upgrade already succeeded, so a sync failure must not read as an
    // upgrade failure.
    try {
      const { appPackageName, plugins } = await resolveInstalledPlugins({
        appRoot,
      });
      const synced = await applySkillsSync(
        await planSkillsSync({
          appPackageName,
          appRoot,
          plugins,
          pruneMissingPackages: true,
        }),
      );
      if (flags.json) {
        this.logJson(
          pluginJsonSuccess('plugin:update', 'success', {
            mode: 'update',
            appRoot,
            ...plan,
            skills: synced,
          }),
        );
      } else {
        this.log(formatSkillsSyncSummary(synced));
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (flags.json) {
        this.logJson(
          pluginJsonSuccess('plugin:update', 'partial-success', {
            mode: 'update',
            appRoot,
            ...plan,
            issues: [classifyPluginError(error)],
          }),
        );
      } else {
        this.warn(
          `Plugins were upgraded, but their skills were not synchronized: ${reason}`,
        );
      }
    }
  }
}
