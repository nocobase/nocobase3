import { Args, Command, Flags } from '@oclif/core';
import type { Interfaces } from '@oclif/core';

export default class CliExampleGreet extends Command {
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

  static override flags: {
    loud: Interfaces.BooleanFlag<boolean>;
    json: Interfaces.BooleanFlag<boolean>;
  } = {
    loud: Flags.boolean({
      default: false,
      description: 'Upper-case the greeting.',
    }),
    json: Flags.boolean({
      default: false,
      description: 'Print one machine-readable JSON result.',
    }),
  };

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(CliExampleGreet);
    const message = flags.loud
      ? `HELLO, ${args.target.toUpperCase()}!`
      : `Hello, ${args.target}.`;

    if (flags.json) {
      this.logJson({ ok: true, message, target: args.target });
      return;
    }
    this.log(message);
  }
}
