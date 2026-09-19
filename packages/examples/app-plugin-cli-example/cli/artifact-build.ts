import { Command, Flags } from '@oclif/core';
import type { Interfaces } from '@oclif/core';
import path from 'node:path';

/**
 * A nested command: the `artifact:build` key makes this `nocobase demo artifact build`.
 *
 * It also shows where a command's real work belongs. Anything expensive is loaded inside `run()` rather than imported
 * at the top of the file, so `--help` stays cheap no matter what the command itself needs.
 */
export default class CliExampleArtifactBuild extends Command {
  static override summary = 'Report what an artifact build would read.';
  static override description =
    'Resolves the configured source directory and reports whether it exists, without writing anything.';

  static override examples: Command.Example[] = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --source-root server/artifacts --json',
  ];

  static override flags: {
    'source-root': Interfaces.OptionFlag<string, Interfaces.CustomOptions>;
    json: Interfaces.BooleanFlag<boolean>;
  } = {
    'source-root': Flags.string({
      default: 'server/artifacts',
      description: 'Directory to read sources from, relative to the app root.',
    }),
    json: Flags.boolean({
      default: false,
      description: 'Print one machine-readable JSON result.',
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(CliExampleArtifactBuild);
    const sourceRoot = path.resolve(process.cwd(), flags['source-root']);

    const { stat } = await import('node:fs/promises');
    const exists = await stat(sourceRoot).then(
      (entry) => entry.isDirectory(),
      () => false,
    );

    if (flags.json) {
      this.logJson({ ok: true, sourceRoot, exists });
      return;
    }
    this.log(
      exists
        ? `Would read sources from ${sourceRoot}.`
        : `Nothing to build: ${sourceRoot} does not exist.`,
    );
  }
}
