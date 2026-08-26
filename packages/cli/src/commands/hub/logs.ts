import { createReadStream } from 'node:fs';
import { open, stat } from 'node:fs/promises';
import path from 'node:path';
import { Command, Flags } from '@oclif/core';
import { HUB_STATE_DIR, requireHubProject } from '../../lib/hub-project.ts';

export const HUB_LOG_FILE = 'hub.log';

export default class HubLogs extends Command {
  static override summary = 'Show hub logs.';
  static override description =
    'Prints what the hub has written to its log file.';

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --follow',
    '<%= config.bin %> <%= command.id %> --tail 200',
  ];

  static override flags = {
    dir: Flags.string({
      description: 'Hub directory. Defaults to the current directory.',
    }),
    follow: Flags.boolean({
      char: 'f',
      default: false,
      description: 'Keep streaming new log lines.',
    }),
    tail: Flags.integer({
      default: 100,
      description: 'Number of recent log lines to show.',
      min: 0,
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(HubLogs);
    const project = await requireHubProject(flags.dir);
    const logPath = path.join(
      project.directory,
      HUB_STATE_DIR,
      'logs',
      HUB_LOG_FILE,
    );

    let size: number;

    try {
      ({ size } = await stat(logPath));
    } catch {
      this.log(
        `No logs yet for "${project.config.name}". Start it with \`${this.config.bin} hub start\`.`,
      );
      return;
    }

    const contents = await this.readTail(logPath, size, flags.tail);

    if (contents) {
      process.stdout.write(
        contents.endsWith('\n') ? contents : `${contents}\n`,
      );
    }

    if (flags.follow) {
      await this.follow(logPath, size);
    }
  }

  /** Reads the whole file and keeps the last N lines. Hub logs are small enough that seeking backwards is not worth it. */
  private async readTail(
    logPath: string,
    size: number,
    tail: number,
  ): Promise<string> {
    if (tail === 0 || size === 0) {
      return '';
    }

    const handle = await open(logPath, 'r');

    try {
      const contents = await handle.readFile('utf8');
      const lines = contents.split('\n');

      // A trailing newline produces an empty final element that is not a line.
      if (lines.at(-1) === '') {
        lines.pop();
      }

      return lines.slice(-tail).join('\n');
    } finally {
      await handle.close();
    }
  }

  /**
   * Polls for growth and prints whatever was appended. Polling is used rather than `fs.watch` because watch events are
   * inconsistent across platforms and network filesystems, and a log tail only needs to feel live.
   */
  private async follow(logPath: string, from: number): Promise<void> {
    let position = from;

    for (;;) {
      await new Promise((resolve) => setTimeout(resolve, 500));

      let size: number;

      try {
        ({ size } = await stat(logPath));
      } catch {
        continue;
      }

      // A smaller file means it was truncated or rotated, so start over from the beginning.
      if (size < position) {
        position = 0;
      }

      if (size === position) {
        continue;
      }

      await new Promise<void>((resolve, reject) => {
        const stream = createReadStream(logPath, {
          start: position,
          end: size - 1,
        });

        stream.on('data', (chunk) => process.stdout.write(chunk));
        stream.once('error', reject);
        stream.once('close', resolve);
      });

      position = size;
    }
  }
}
