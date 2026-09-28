import type { Command } from '@oclif/core';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { AppCommand } from '../context.ts';

export interface AppInfoResult {
  readonly name: string | null;
  readonly version: string | null;
}

export default class AppInfo extends AppCommand {
  static override summary = "Print this application's name and version.";
  static override description =
    'Reads the application manifest. A starting point for commands this application owns; replace or extend it as needed.';

  static override examples: Command.Example[] = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --json',
  ];

  public async run(): Promise<AppInfoResult> {
    await this.parse(AppInfo);
    const manifest = JSON.parse(
      await readFile(path.join(this.rootDir, 'package.json'), 'utf8'),
    ) as { name?: string; version?: string };

    this.log(
      `${manifest.name ?? '(unnamed)'} ${manifest.version ?? ''}`.trim(),
    );
    return { name: manifest.name ?? null, version: manifest.version ?? null };
  }
}
