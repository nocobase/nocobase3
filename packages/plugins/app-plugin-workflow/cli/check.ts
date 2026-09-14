import { Args, Command, Flags } from '@oclif/core';
import type { Interfaces } from '@oclif/core';
import path from 'node:path';

export default class WorkflowCheck extends Command {
  static override summary = 'Validate a source-managed workflow package.';
  static override description =
    'Runs the Workflow typecheck, evaluation, schema, semantic, and compile validation phases without loading or running the workflow.';

  static override examples: Command.Example[] = [
    '<%= config.bin %> <%= command.id %> server/workflows/order-fulfillment',
    '<%= config.bin %> <%= command.id %> server/workflows/order-fulfillment/workflow.ts --json',
    '<%= config.bin %> <%= command.id %> server/workflows/order-fulfillment --ir',
  ];

  static override args: {
    package: Interfaces.Arg<string, Interfaces.CustomOptions>;
  } = {
    package: Args.string({
      description:
        'Workflow package directory or workflow.ts file to validate.',
      required: true,
    }),
  };

  static override flags: {
    ir: Interfaces.BooleanFlag<boolean>;
    json: Interfaces.BooleanFlag<boolean>;
  } = {
    ir: Flags.boolean({
      default: false,
      description:
        'Print the compiled flat IR, the definition an Artifact would carry.',
    }),
    json: Flags.boolean({
      default: false,
      description: 'Print one machine-readable JSON result.',
    }),
  };

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(WorkflowCheck);
    const { checkWorkflowPackage } = await import('../build/index.js');
    const result = await checkWorkflowPackage(path.resolve(args.package));
    const output = {
      ok: true,
      status: 'success',
      file: result.file,
      nodes: result.ir.nodes.length,
      ...(flags.ir ? { ir: result.ir } : {}),
    };

    if (flags.json) {
      this.logJson(output);
      return;
    }
    if (flags.ir) {
      this.log(JSON.stringify(result.ir, null, 2));
      return;
    }
    this.log(`Workflow check passed: ${output.file} (${output.nodes} nodes)`);
  }
}
