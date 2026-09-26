import type { Command } from '@oclif/core';

import { AppCommand } from '../context.ts';
import {
  describeCommandTree,
  formatCommandCatalog,
  type CommandCatalog,
} from '../runtime/catalog.ts';
import { resolvedCli } from '../runtime/command-store.ts';

export default class Commands extends AppCommand {
  static override summary =
    'List every command as a machine-readable catalog, for agents and scripts.';
  static override description =
    "Covers the built-in commands, this application's own `app` commands and every registered plugin's commands that run here — a built dist/ has no development commands. With --json, each entry carries its source, whether it is development-only, whether it takes --json, --dry-run and --force, and its arguments, flags and examples. Without it, prints each command's id and summary, grouped by topic.";

  static override examples: Command.Example[] = [
    '<%= config.bin %> <%= command.id %> --json',
    '<%= config.bin %> <%= command.id %>',
  ];

  public async run(): Promise<CommandCatalog> {
    await this.parse(Commands);
    const assembled = resolvedCli();
    if (assembled === undefined) {
      throw new Error(
        'The command catalog is read from the tree the nocobase CLI assembles; run it through the nocobase bin.',
      );
    }
    const catalog = describeCommandTree(assembled, { bin: this.config.bin });
    this.log(formatCommandCatalog(catalog));
    return catalog;
  }
}
