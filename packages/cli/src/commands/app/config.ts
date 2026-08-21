import { Args, Command, Flags } from '@oclif/core';
import { reportStub } from '../../lib/stub.ts';

export default class AppConfig extends Command {
  static override summary = 'Show or change app configuration.';
  static override description =
    'Reads and writes the app configuration stored in .nb3/. Prints all values when no key is given, prints one value when a key is given, and sets it when a value follows.';

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> hub',
    '<%= config.bin %> <%= command.id %> hub http://localhost:3000',
  ];

  static override args = {
    key: Args.string({ description: 'Configuration key to read or write.' }),
    value: Args.string({
      description: 'New value. When given, the key is set to it.',
    }),
  };

  static override flags = {
    dir: Flags.string({
      description: 'App directory. Defaults to the current directory.',
    }),
    json: Flags.boolean({
      description: 'Print the result as JSON.',
      default: false,
    }),
  };

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(AppConfig);
    reportStub(this, { args, flags });
  }
}
