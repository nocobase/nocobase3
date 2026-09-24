import { Command, Flags } from '@oclif/core';

import {
  applySkillsSync,
  formatSkillsSyncSummary,
  planSkillsSync,
  resolveInstalledPlugins,
} from '../../lib/skills-sync.ts';
import {
  classifyPluginError,
  pluginJsonFailure,
  pluginJsonSuccess,
} from '../../lib/plugin-json.ts';
import { resolveAppRoot } from '../../lib/workspace-app.ts';

export default class SkillsSync extends Command {
  static override summary =
    "Copy NocoBase package skills into the app's .agents/skills.";
  static override description =
    "NocoBase packages ship App-facing skills in skills/nocobase-*/ and this copies them into the app's ignored local .agents/skills/ directory. Direct @nocobase/* dependencies and registered plugins are synchronized. Upstream is the single source of truth: each synchronized directory is replaced wholesale, while app-owned skills are preserved. Run this after installing or upgrading packages whose skills changed.";

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --package @nocobase/app-skills',
    '<%= config.bin %> <%= command.id %> --plugin audit-log',
    '<%= config.bin %> <%= command.id %> --dry-run',
    '<%= config.bin %> <%= command.id %> --workspace-root . --app app-template-default',
  ];

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
    package: Flags.string({
      description:
        'Only synchronize this installed @nocobase/* package by its full package name.',
      exclusive: ['plugin'],
    }),
    plugin: Flags.string({
      description:
        'Only synchronize this installed plugin. Retained for compatibility; prefer --package for a full package name.',
      exclusive: ['package'],
    }),
    'dry-run': Flags.boolean({
      default: false,
      description: 'Print what would change without writing anything.',
    }),
    json: Flags.boolean({
      default: false,
      description: 'Print the result as JSON.',
    }),
  };

  protected readonly operation: string = 'skills:sync';

  public async run(): Promise<void> {
    try {
      await this.runUnsafe();
    } catch (error) {
      const json = this.argv.includes('--json');
      if (!json) {
        throw error;
      }
      const classified = classifyPluginError(error);
      const errorResult =
        classified.code === 'PLUGIN_NOT_INSTALLED'
          ? {
              ...classified,
              suggestions: [
                'Run the App package manager install, then retry the sync.',
              ],
            }
          : classified.code === 'PLUGIN_COMMAND_FAILED'
            ? { ...classified, code: 'SKILLS_SYNC_FAILED' }
            : classified;
      this.logToStderr(
        JSON.stringify(pluginJsonFailure(this.operation, errorResult), null, 2),
      );
      process.exitCode = 1;
    }
  }

  private async runUnsafe(): Promise<void> {
    const { flags } = await this.parse(SkillsSync);
    const appRoot = await resolveAppRoot({
      app: flags.app,
      dir: flags.dir,
      workspaceRoot: flags['workspace-root'],
    });
    const dryRun = flags['dry-run'];

    const { appPackageName, plugins } = await resolveInstalledPlugins({
      appRoot,
      packageName: flags.package,
      plugin: flags.plugin,
    });
    const planned = await planSkillsSync({
      appPackageName,
      appRoot,
      plugins,
      pruneMissingPackages:
        flags.package === undefined && flags.plugin === undefined,
    });
    const plan = dryRun ? planned : await applySkillsSync(planned);
    const result = { ...plan, dryRun };

    if (flags.json) {
      this.logJson(pluginJsonSuccess(this.operation, 'success', result));
      return;
    }
    this.log(formatSkillsSyncSummary(result));
  }
}
