import { Args, Command, Flags } from '@oclif/core';
import { reportStub } from '../../lib/stub.ts';

export default class AppDestroy extends Command {
  static override summary = 'Delete an app from a hub.';

  static override examples = [
    '<%= config.bin %> <%= command.id %> crm',
    '<%= config.bin %> <%= command.id %> crm --hub http://localhost:3000 --yes',
  ];

  static override args = {
    name: Args.string({ description: 'App name to delete.', required: true }),
  };

  static override flags = {
    hub: Flags.string({ description: 'Hub URL the app is deployed to.' }),
    yes: Flags.boolean({
      char: 'y',
      description: 'Skip the confirmation prompt.',
      default: false,
    }),
  };

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(AppDestroy);
    reportStub(this, { args, flags });
  }
}
