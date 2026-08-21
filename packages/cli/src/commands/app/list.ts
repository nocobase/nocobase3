import { Command, Flags } from '@oclif/core';
import { reportStub } from '../../lib/stub.ts';

export default class AppList extends Command {
  static override summary = 'List the apps in a hub.';

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --hub http://localhost:3000',
  ];

  static override flags = {
    hub: Flags.string({ description: 'Hub URL to list apps from.' }),
    json: Flags.boolean({
      description: 'Print the result as JSON.',
      default: false,
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(AppList);
    reportStub(this, { flags });
  }
}
