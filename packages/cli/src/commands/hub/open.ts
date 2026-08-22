import path from 'node:path';
import { Command, Flags } from '@oclif/core';
import {
  HUB_STATE_DIR,
  hubUrl,
  requireHubProject,
} from '../../lib/hub-project.ts';
import { readProcessRecord } from '../../lib/process-store.ts';
import { runCommand } from '../../lib/run-command.ts';

/** Each platform's "open this the way the user would" command. */
function openerFor(platform: NodeJS.Platform): {
  command: string;
  args: string[];
} {
  if (platform === 'darwin') {
    return { args: [], command: 'open' };
  }

  if (platform === 'win32') {
    // `start` is a shell builtin; the empty string is the window title that its first quoted argument would become.
    return { args: ['/c', 'start', ''], command: 'cmd' };
  }

  return { args: [], command: 'xdg-open' };
}

export default class HubOpen extends Command {
  static override summary = 'Open the app console in a browser.';
  static override description =
    'The app console is where apps are created, inspected, configured, and managed.';

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --print',
  ];

  static override flags = {
    dir: Flags.string({
      description: 'Hub directory. Defaults to the current directory.',
    }),
    print: Flags.boolean({
      default: false,
      description: 'Print the URL instead of opening a browser.',
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(HubOpen);
    const project = await requireHubProject(flags.dir);
    const url = hubUrl(project.config);

    if (flags.print) {
      this.log(url);
      return;
    }

    const record = await readProcessRecord(
      path.join(project.directory, HUB_STATE_DIR),
    );

    if (record?.running !== true) {
      this.warn(
        `"${project.config.name}" does not look like it is running. Opening ${url} anyway.`,
      );
    }

    const opener = openerFor(process.platform);

    try {
      await runCommand(opener.command, [...opener.args, url], {
        timeoutMs: 10_000,
      });
      this.log(`Opened ${url}`);
    } catch {
      // A headless machine has no browser to open; the URL is still what the user wanted.
      this.log(url);
    }
  }
}
