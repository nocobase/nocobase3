import { Command, Flags } from '@oclif/core';
import { reportStub } from '../../lib/stub.ts';

export default class HubStatus extends Command {
  static override summary = 'Show hub status.';
  static override description =
    'Reports whether the hub is running, its address, the app console address, and how many apps are deployed.';

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --json',
  ];

  static override flags = {
    dir: Flags.string({
      description: 'Hub directory. Defaults to the current directory.',
    }),
    json: Flags.boolean({
      description: 'Print the result as JSON.',
      default: false,
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(HubStatus);
    reportStub(this, { flags });
  }
}
