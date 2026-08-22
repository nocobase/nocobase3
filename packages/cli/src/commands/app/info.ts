import { access } from 'node:fs/promises';
import path from 'node:path';
import { Args, Command, Flags } from '@oclif/core';
import { requireAppProject } from '../../lib/app-project.ts';

export default class AppInfo extends Command {
  static override summary = 'Show information about an app.';
  static override description =
    'Shows details for the app in the current directory.';

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --dir ./crm',
    '<%= config.bin %> <%= command.id %> --json',
  ];

  static override args = {
    name: Args.string({
      // TODO: Look the app up in a hub when a name is given. That needs an app API the v3 hub does not expose yet.
      description:
        'App name. Reserved for looking an app up in a hub; not supported yet.',
    }),
  };

  static override flags = {
    dir: Flags.string({
      description: 'App directory. Defaults to the current directory.',
    }),
    json: Flags.boolean({
      default: false,
      description: 'Print the result as JSON.',
    }),
  };

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(AppInfo);

    if (args.name !== undefined) {
      this.error(
        [
          'Looking up an app by name needs a hub, which is not supported yet.',
          'Run this from inside an app directory, or pass --dir.',
        ].join('\n'),
      );
    }

    const project = await requireAppProject(flags.dir);
    const installed = await this.hasDependencies(project.directory);
    const info = {
      dependenciesInstalled: installed,
      directory: project.directory,
      hub: project.config.hub ?? null,
      name: project.config.name,
      template: `${project.config.template}@${project.config.templateVersion}`,
    };

    if (flags.json) {
      this.logJson(info);
      return;
    }

    const rows: Array<[string, string]> = [
      ['Name', info.name],
      ['Directory', info.directory],
      ['Template', info.template],
      ['Hub', info.hub ?? 'not set'],
      ['Dependencies', installed ? 'installed' : 'not installed'],
    ];
    const width = Math.max(...rows.map(([label]) => label.length));

    for (const [label, value] of rows) {
      this.log(`${label.padEnd(width)}  ${value}`);
    }
  }

  private async hasDependencies(directory: string): Promise<boolean> {
    try {
      await access(path.join(directory, 'node_modules'));
      return true;
    } catch {
      return false;
    }
  }
}
