import { Command, Flags } from '@oclif/core';
import { reportStub } from '../../lib/stub.ts';

export default class HubStop extends Command {
  static override summary = 'Stop the hub.';

  static override examples = ['<%= config.bin %> <%= command.id %>'];

  static override flags = {
    dir: Flags.string({
      description: 'Hub directory. Defaults to the current directory.',
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(HubStop);
    reportStub(this, { flags });
  }
}
