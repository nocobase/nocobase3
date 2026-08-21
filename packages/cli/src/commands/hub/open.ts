import { Command, Flags } from '@oclif/core';
import { reportStub } from '../../lib/stub.ts';

export default class HubOpen extends Command {
  static override summary = 'Open the app console in a browser.';
  static override description =
    'The app console is where apps are created, inspected, configured, and managed.';

  static override examples = ['<%= config.bin %> <%= command.id %>'];

  static override flags = {
    dir: Flags.string({
      description: 'Hub directory. Defaults to the current directory.',
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(HubOpen);
    reportStub(this, { flags });
  }
}
