import { AppCommand, appPath } from '@nocobase/app-cli';
import type { Command, Interfaces } from '@oclif/core';

/** What `artifact build` returns. Under `--json` it is the `result` of the one document the command prints. */
export interface ArtifactBuildResult {
  /** The absolute source directory the build would read. */
  readonly sourceRoot: string;
  readonly exists: boolean;
}

/**
 * A nested command: the `artifact:build` key makes this `nocobase cli-example artifact build`.
 *
 * It also shows where a command's real work belongs. Anything expensive is loaded inside `run()` rather than imported
 * at the top of the file, so `--help` stays cheap no matter what the command itself needs.
 */
export default class CliExampleArtifactBuild extends AppCommand {
  static override summary = 'Report what an artifact build would read.';
  static override description =
    'Resolves the configured source directory and reports whether it exists, without writing anything.';

  static override examples: Command.Example[] = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --source-root server/artifacts --json',
  ];

  // `appPath()` hands `run()` an absolute path: a typed value resolves from the current directory, and the default
  // from the application root, wherever the command runs.
  static override flags: {
    'source-root': Interfaces.OptionFlag<string>;
  } = {
    'source-root': appPath({
      default: 'server/artifacts',
      description: 'Directory to read sources from.',
    }),
  };

  public async run(): Promise<ArtifactBuildResult> {
    const { flags } = await this.parse(CliExampleArtifactBuild);
    const sourceRoot = flags['source-root'];

    const { stat } = await import('node:fs/promises');
    const exists = await stat(sourceRoot).then(
      (entry) => entry.isDirectory(),
      () => false,
    );

    this.log(
      exists
        ? `Would read sources from ${sourceRoot}.`
        : `Nothing to build: ${sourceRoot} does not exist.`,
    );
    return { sourceRoot, exists };
  }
}
