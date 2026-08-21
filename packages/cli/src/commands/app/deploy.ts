import { Command, Flags } from '@oclif/core';
import { reportStub } from '../../lib/stub.ts';

export default class AppDeploy extends Command {
  static override summary = 'Deploy the app to a hub.';
  static override description =
    'Deploys the app to the target hub. When --hub is omitted, the hub address recorded in .nb3/ is used.';

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --hub http://localhost:3000',
    '<%= config.bin %> <%= command.id %> --hub https://apps.example.com',
  ];

  static override flags = {
    dir: Flags.string({
      description: 'App directory. Defaults to the current directory.',
    }),
    hub: Flags.string({
      description: 'Target hub URL. Defaults to the hub recorded in .nb3/.',
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(AppDeploy);
    reportStub(this, { flags });
  }
}
