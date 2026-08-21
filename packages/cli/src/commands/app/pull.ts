import { Args, Command, Flags } from '@oclif/core';
import { reportStub } from '../../lib/stub.ts';

export default class AppPull extends Command {
  static override summary = 'Pull an existing app from a hub.';
  static override description =
    'Downloads an app that already exists in a hub so it can be developed locally. The local directory records the hub and app it came from.';

  static override examples = [
    '<%= config.bin %> <%= command.id %> crm ./crm',
    '<%= config.bin %> <%= command.id %> crm ./crm --hub http://localhost:3000',
  ];

  static override args = {
    name: Args.string({ description: 'App name in the hub.', required: true }),
    dir: Args.string({
      description: 'Local directory to pull into. Defaults to ./<name>.',
    }),
  };

  static override flags = {
    hub: Flags.string({ description: 'Hub URL to pull from.' }),
  };

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(AppPull);
    reportStub(this, { args, flags });
  }
}
