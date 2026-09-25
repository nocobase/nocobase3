import { Flags } from '@oclif/core';
import type { Command, Interfaces } from '@oclif/core';

import { CommandError } from '../../command/errors.ts';
import { AppCommand } from '../../context.ts';
import {
  applySkillsSync,
  formatSkillsSyncSummary,
  planSkillsSync,
  resolveInstalledPlugins,
  type SkillsSyncPlan,
} from '../../lib/skills-sync.ts';
import {
  classifyPluginError,
  PLUGIN_COMMAND_FAILED,
} from '../../lib/plugin-json.ts';
import { resolveAppRoot } from '../../lib/workspace-app.ts';

/** The Skills copied and removed, or with `dryRun` the ones that would be. */
export interface SkillsSyncResult extends SkillsSyncPlan {
  readonly dryRun: boolean;
}

export default class SkillsSync extends AppCommand {
  static override summary =
    'Copy NocoBase package Skills into .agents/skills and link them into .claude/skills.';
  static override description =
    "NocoBase packages ship App-facing skills in skills/nocobase-*/ and this copies them into the app's ignored local .agents/skills/ directory. Direct @nocobase/* dependencies and registered plugins are synchronized. Upstream is the single source of truth: each synchronized directory is replaced wholesale, while app-owned skills are preserved. Run this after installing or upgrading packages whose skills changed.";

  static override examples: Command.Example[] = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --package @nocobase/app-skills',
    '<%= config.bin %> <%= command.id %> --plugin audit-log',
    '<%= config.bin %> <%= command.id %> --dry-run',
    '<%= config.bin %> <%= command.id %> --workspace-root . --app app-template-default',
  ];

  static override flags: {
    dir: Interfaces.OptionFlag<string | undefined>;
    app: Interfaces.OptionFlag<string | undefined>;
    'workspace-root': Interfaces.OptionFlag<string | undefined>;
    package: Interfaces.OptionFlag<string | undefined>;
    plugin: Interfaces.OptionFlag<string | undefined>;
    'dry-run': Interfaces.BooleanFlag<boolean>;
  } = {
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
  };

  public async run(): Promise<SkillsSyncResult> {
    const { flags } = await this.parse(SkillsSync);
    let result: SkillsSyncResult;
    try {
      const appRoot = await resolveAppRoot({
        app: flags.app,
        dir: flags.dir,
        workspaceRoot: flags['workspace-root'],
      });
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
      const dryRun = flags['dry-run'];
      const plan = dryRun ? planned : await applySkillsSync(planned);
      result = { ...plan, dryRun };
    } catch (error) {
      throw skillsSyncError(error);
    }
    this.log(formatSkillsSyncSummary(result));
    return result;
  }
}

/** A plugin command's classification, with the codes and advice that fit a synchronization. */
function skillsSyncError(error: unknown): CommandError {
  const classified = classifyPluginError(error);
  if (classified.errorCode === 'PLUGIN_NOT_INSTALLED') {
    return new CommandError(classified.message, {
      code: classified.errorCode,
      suggestions: [
        'Run the App package manager install, then retry the sync.',
      ],
      cause: error,
    });
  }
  if (classified.errorCode === PLUGIN_COMMAND_FAILED) {
    return new CommandError(classified.message, {
      code: 'SKILLS_SYNC_FAILED',
      suggestions: classified.commandSuggestions,
      cause: error,
    });
  }
  return classified;
}
