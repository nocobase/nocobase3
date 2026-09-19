import { Command, Flags } from '@oclif/core';
import type { Interfaces } from '@oclif/core';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export default class AppInfo extends Command {
  static override summary = 'Print this application’s name and version.';
  static override description =
    'Reads the application manifest. A starting point for commands this application owns; replace or extend it as needed.';

  static override examples: Command.Example[] = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --json',
  ];

  static override flags: {
    json: Interfaces.BooleanFlag<boolean>;
  } = {
    json: Flags.boolean({
      default: false,
      description: 'Print one machine-readable JSON result.',
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(AppInfo);
    const manifestPath = path.resolve(
      import.meta.dirname,
      '..',
      '..',
      'package.json',
    );
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
      name?: string;
      version?: string;
    };

    if (flags.json) {
      this.logJson({
        ok: true,
        name: manifest.name,
        version: manifest.version,
      });
      return;
    }
    this.log(
      `${manifest.name ?? '(unnamed)'} ${manifest.version ?? ''}`.trim(),
    );
  }
}
