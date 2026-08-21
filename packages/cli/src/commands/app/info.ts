import { Args, Command, Flags } from '@oclif/core';
import { reportStub } from '../../lib/stub.ts';

export default class AppInfo extends Command {
  static override summary = 'Show information about an app.';
  static override description =
    'Shows details for the app in the current directory, or for a named app when one is given.';

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> crm --hub http://localhost:3000',
  ];

  static override args = {
    name: Args.string({
      description: 'App name. Defaults to the app in the current directory.',
    }),
  };

  static override flags = {
    hub: Flags.string({ description: 'Hub URL to read the app from.' }),
    json: Flags.boolean({
      description: 'Print the result as JSON.',
      default: false,
    }),
  };

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(AppInfo);
    reportStub(this, { args, flags });
  }
}
