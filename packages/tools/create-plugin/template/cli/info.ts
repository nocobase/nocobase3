import { AppCommand } from '@nocobase/app-cli';
import type { Command } from '@oclif/core';

import packageMetadata from '../package.json' with { type: 'json' };

/** What `info` returns. Under `--json` it is the `result` of the one document the command prints. */
export interface PluginInfoResult {
  readonly name: string;
  readonly version: string;
}

/**
 * A command returns its result and throws `CommandError` from `@nocobase/app-cli` when it fails. `AppCommand` provides
 * `--json`, which prints the result or the error as one document, so the command does not declare that flag or branch
 * on it; `this.log` is silent under `--json`.
 *
 * The type annotations on static members and on `run()` are required rather than stylistic: this package emits
 * `.d.ts`, and `isolatedDeclarations` does not allow inferring an exported shape from its initializer. Annotate each
 * flag with its own type — `Interfaces.FlagInput` compiles but degrades `this.parse()` to `any`.
 */
export default class PluginInfo extends AppCommand {
  static override summary = 'Report this plugin.';
  static override description =
    'Prints the plugin name and version. Commands are static tooling by default: they read and write files and packages. One that needs the application uses this.withApp(), which always shuts it down again.';

  static override examples: Command.Example[] = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --json',
  ];

  public async run(): Promise<PluginInfoResult> {
    await this.parse(PluginInfo);
    // Read from the manifest rather than written as a literal: `changeset version` moves the version during a release
    // and runs the tests afterwards, so a hard-coded one fails exactly when a release is already under way.
    const info: PluginInfoResult = {
      name: packageMetadata.name,
      version: packageMetadata.version,
    };

    this.log(`${info.name} ${info.version}`);
    return info;
  }
}
