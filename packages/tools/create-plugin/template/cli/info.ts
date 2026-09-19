import { Command, Flags } from '@oclif/core';
import type { Interfaces } from '@oclif/core';

import packageMetadata from '../package.json' with { type: 'json' };

/**
 * The type annotations on `flags` are required rather than stylistic: this package emits `.d.ts`, and
 * `isolatedDeclarations` does not allow inferring an exported shape from its initializer. Annotate each flag with its
 * own type — `Interfaces.FlagInput` compiles but degrades `this.parse()` to `any`.
 */
export default class PluginInfo extends Command {
  static override summary = 'Report this plugin.';
  static override description =
    'Prints the plugin name and version. Commands are static tooling: they read and write files and packages, and never start the application or resolve a service.';

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
    const { flags } = await this.parse(PluginInfo);
    // Read from the manifest rather than written as a literal: `changeset version` moves the version during a release
    // and runs the tests afterwards, so a hard-coded one fails exactly when a release is already under way.
    const info = {
      name: packageMetadata.name,
      version: packageMetadata.version,
    };

    if (flags.json) {
      this.logJson({ ok: true, ...info });
      return;
    }
    this.log(`${info.name} ${info.version}`);
  }
}
