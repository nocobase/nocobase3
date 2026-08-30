import { Command, Flags } from '@oclif/core';

import {
  applySkillsSync,
  formatSkillsSyncSummary,
  planSkillsSync,
  resolveInstalledPlugins,
} from '../../../../lib/skills-sync.ts';
import { resolveAppRoot } from '../../../../lib/workspace-app.ts';

export default class AppSkillsSync extends Command {
  static override summary = "Copy plugin skills into the app's .agents/skills.";
  static override description =
    "Plugins ship App-facing skills in skills/nocobase-<package>/ and this copies them into the app's ignored local .agents/skills/ directory. Upstream is the single source of truth: each synchronized directory is replaced wholesale, and directories whose names do not start with nocobase- are never touched. Run this after upgrading a plugin whose skills changed.";

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
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
    plugin: Flags.string({
      description:
        'Only synchronize this plugin. Defaults to every registered plugin.',
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

  public async run(): Promise<void> {
    try {
      await this.runUnsafe();
    } catch (error) {
      const json = this.argv.includes('--json');
      if (!json) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      const code = message.includes('is not installed')
        ? 'PLUGIN_NOT_INSTALLED'
        : message.includes('Invalid skill directory')
          ? 'INVALID_SKILL_DIRECTORY'
          : message.includes('Skill name collision')
            ? 'SKILL_NAME_COLLISION'
            : 'SKILLS_SYNC_FAILED';
      this.logToStderr(
        JSON.stringify(
          {
            schemaVersion: 1,
            ok: false,
            operation: 'plugin:skills:sync',
            error: {
              code,
              message,
              suggestions:
                code === 'PLUGIN_NOT_INSTALLED'
                  ? [
                      'Run the App package manager install, then retry the sync.',
                    ]
                  : ['Run the command with --help and correct the request.'],
            },
          },
          null,
          2,
        ),
      );
      process.exitCode = 1;
    }
  }

  private async runUnsafe(): Promise<void> {
    const { flags } = await this.parse(AppSkillsSync);
    const appRoot = await resolveAppRoot({
      app: flags.app,
      dir: flags.dir,
      workspaceRoot: flags['workspace-root'],
    });
    const dryRun = flags['dry-run'];

    const { appPackageName, plugins } = await resolveInstalledPlugins({
      appRoot,
      plugin: flags.plugin,
    });
    const planned = await planSkillsSync({ appPackageName, appRoot, plugins });
    const plan = dryRun ? planned : await applySkillsSync(planned);
    const result = { ...plan, dryRun };

    if (flags.json) {
      this.logJson({
        schemaVersion: 1,
        ok: true,
        operation: 'plugin:skills:sync',
        result,
      });
      return;
    }
    this.log(formatSkillsSyncSummary(result));
  }
}
