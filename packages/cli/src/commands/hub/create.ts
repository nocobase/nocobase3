import { Args, Command, Flags } from '@oclif/core';
import { reportStub } from '../../lib/stub.ts';

export default class HubCreate extends Command {
  static override summary = 'Create a local hub.';
  static override description =
    'Scaffolds a hub runtime directory. A hub is only needed to deploy and manage apps; local app development does not require one.';

  static override examples = [
    '<%= config.bin %> <%= command.id %> my-hub',
    '<%= config.bin %> <%= command.id %> my-hub --dir ./hubs/my-hub',
  ];

  static override args = {
    name: Args.string({
      description: 'Hub name, also used as the directory name by default.',
      required: true,
    }),
  };

  static override flags = {
    dir: Flags.string({
      description: 'Directory to create the hub in. Defaults to ./<name>.',
    }),
  };

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(HubCreate);
    reportStub(this, { args, flags });
  }
}
