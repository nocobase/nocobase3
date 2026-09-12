import { Command, Flags } from '@oclif/core';
import type { Interfaces } from '@oclif/core';
import path from 'node:path';

export default class WorkflowBuild extends Command {
  static override summary = 'Build application workflow artifacts.';
  static override description =
    'Validates every workflow package in the source root and writes its deployable Artifact to the distribution root.';

  static override examples: Command.Example[] = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --source-root server/workflows --dist-root dist/server/workflows',
    '<%= config.bin %> <%= command.id %> --resource-root dist/server/workflows --json',
  ];

  static override flags: {
    'source-root': Interfaces.OptionFlag<string, Interfaces.CustomOptions>;
    'dist-root': Interfaces.OptionFlag<string, Interfaces.CustomOptions>;
    'resource-root': Interfaces.OptionFlag<
      string | undefined,
      Interfaces.CustomOptions
    >;
    json: Interfaces.BooleanFlag<boolean>;
  } = {
    'source-root': Flags.string({
      default: 'server/workflows',
      description: 'Workflow source directory, relative to the app root.',
    }),
    'dist-root': Flags.string({
      default: 'dist/server/workflows',
      description: 'Artifact output directory, relative to the app root.',
    }),
    'resource-root': Flags.string({
      description:
        'Compiled workflow resource directory, relative to the app root.',
    }),
    json: Flags.boolean({
      default: false,
      description: 'Print one machine-readable JSON result.',
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(WorkflowBuild);
    const cwd = process.cwd();
    const sourceRoot = path.resolve(cwd, flags['source-root']);
    const distRoot = path.resolve(cwd, flags['dist-root']);
    const { buildApplicationWorkflows } = await import('../build/index.js');
    const result = await buildApplicationWorkflows({
      sourceRoot,
      distRoot,
      ...(flags['resource-root'] === undefined
        ? {}
        : { resourceRoot: path.resolve(cwd, flags['resource-root']) }),
    });
    const output = {
      ok: true,
      status: 'success',
      packages: result.packages,
      distRoot,
    };

    if (flags.json) {
      this.logJson(output);
      return;
    }
    this.log(
      `Workflow build generated ${output.packages} Artifact(s) in ${output.distRoot}`,
    );
  }
}
