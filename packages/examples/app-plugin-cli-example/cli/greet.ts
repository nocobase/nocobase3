import { AppCommand } from '@nocobase/app-cli';
import { Args, Flags } from '@oclif/core';
import type { Command, Interfaces } from '@oclif/core';

/** What `greet` returns. Under `--json` it is the `result` of the one document the command prints. */
export interface GreetResult {
  readonly message: string;
  readonly target: string;
}

export default class CliExampleGreet extends AppCommand {
  static override summary = 'Print a greeting.';
  static override description =
    'Demonstrates arguments, flags, and JSON output in a plugin-contributed command.';

  static override examples: Command.Example[] = [
    '<%= config.bin %> <%= command.id %> world',
    '<%= config.bin %> <%= command.id %> world --loud',
    '<%= config.bin %> <%= command.id %> world --json',
  ];

  static override args: {
    target: Interfaces.Arg<string, Interfaces.CustomOptions>;
  } = {
    target: Args.string({
      description: 'Who to greet.',
      required: true,
    }),
  };

  // `--json` is not declared here: AppCommand provides it, and prints what `run()` returns.
  static override flags: {
    loud: Interfaces.BooleanFlag<boolean>;
  } = {
    loud: Flags.boolean({
      default: false,
      description: 'Upper-case the greeting.',
    }),
  };

  public async run(): Promise<GreetResult> {
    const { args, flags } = await this.parse(CliExampleGreet);
    const message = flags.loud
      ? `HELLO, ${args.target.toUpperCase()}!`
      : `Hello, ${args.target}.`;

    // Silent under `--json`, where the returned result is printed instead.
    this.log(message);
    return { message, target: args.target };
  }
}
