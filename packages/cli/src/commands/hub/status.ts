import path from 'node:path';
import { readdir } from 'node:fs/promises';
import { Command, Flags } from '@oclif/core';
import {
  HUB_STATE_DIR,
  hubUrl,
  requireHubProject,
} from '../../lib/hub-project.ts';
import { readProcessRecord } from '../../lib/process-store.ts';

export default class HubStatus extends Command {
  static override summary = 'Show hub status.';
  static override description =
    'Reports whether the hub is running, its address, and how many apps are deployed to it.';

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --json',
  ];

  static override flags = {
    dir: Flags.string({
      description: 'Hub directory. Defaults to the current directory.',
    }),
    json: Flags.boolean({
      default: false,
      description: 'Print the result as JSON.',
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(HubStatus);
    const project = await requireHubProject(flags.dir);
    const record = await readProcessRecord(
      path.join(project.directory, HUB_STATE_DIR),
    );
    const running = record?.running === true;
    const status = {
      apps: await this.countApps(project.directory),
      directory: project.directory,
      name: project.config.name,
      pid: running ? record?.pid : null,
      running,
      startedAt: running ? (record?.startedAt ?? null) : null,
      url: hubUrl(project.config),
    };

    if (flags.json) {
      this.logJson(status);
      return;
    }

    const rows: Array<[string, string]> = [
      ['Name', status.name],
      ['Status', running ? `running (pid ${status.pid})` : 'stopped'],
      ['URL', status.url],
      ['Directory', status.directory],
      ['Apps', String(status.apps)],
    ];

    if (running && status.startedAt) {
      rows.push(['Started', status.startedAt]);
    }

    const width = Math.max(...rows.map(([label]) => label.length));

    for (const [label, value] of rows) {
      this.log(`${label.padEnd(width)}  ${value}`);
    }
  }

  private async countApps(directory: string): Promise<number> {
    try {
      const entries = await readdir(path.join(directory, 'app-dist'), {
        withFileTypes: true,
      });
      return entries.filter((entry) => entry.isDirectory()).length;
    } catch {
      return 0;
    }
  }
}
