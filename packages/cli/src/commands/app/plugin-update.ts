import { Command, Flags } from '@oclif/core';
import path from 'node:path';

import { planPluginUpdate } from '../../lib/plugin-update.ts';
import { runAttached } from '../../lib/run-command.ts';
import {
  applySkillsSync,
  formatSkillsSyncSummary,
  planSkillsSync,
  resolveInstalledPlugins,
} from '../../lib/skills-sync.ts';

export default class AppPluginUpdate extends Command {
  static override summary = 'Upgrade plugins and re-synchronize their skills.';
  static override description =
    'Upgrades the plugin packages through the package manager the app already uses, then copies the skills the upgraded plugins ship into .agents/skills. Without --plugin every registered plugin is upgraded. The skills copy is the reason to prefer this over upgrading by hand: skills live in the app, so an upgrade leaves a stale copy behind until something re-runs the sync.';

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --plugin audit-log',
    '<%= config.bin %> <%= command.id %> --plugin audit-log --plugin workflow',
    '<%= config.bin %> <%= command.id %> --dry-run',
  ];

  static override flags = {
    dir: Flags.string({
      description: 'App directory. Defaults to the current directory.',
    }),
    plugin: Flags.string({
      description:
        'Plugin to upgrade. Repeat for several. Defaults to every registered plugin.',
      multiple: true,
    }),
    'dry-run': Flags.boolean({
      default: false,
      description: 'Print what would run without upgrading anything.',
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(AppPluginUpdate);
    const appRoot = path.resolve(flags.dir ?? process.cwd());
    const dryRun = flags['dry-run'];

    const plan = await planPluginUpdate({ appRoot, plugins: flags.plugin });
    if (plan.packageNames.length === 0) {
      this.log('No plugins are registered in this app.');
      return;
    }

    if (dryRun) {
      this.log(
        `Would run: ${plan.packageManager} ${plan.args.join(' ')}\nThen synchronize the skills of: ${plan.packageNames.join(', ')}`,
      );
      return;
    }

    this.log(`${plan.packageManager} ${plan.args.join(' ')}`);
    const exitCode = await runAttached(plan.packageManager, [...plan.args], {
      cwd: appRoot,
    });
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
        await planSkillsSync({ appPackageName, appRoot, plugins }),
      );
      this.log(formatSkillsSyncSummary(synced));
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.warn(
        `Plugins were upgraded, but their skills were not synchronized: ${reason}`,
      );
    }
  }
}
