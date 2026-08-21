import { Args, Command, Flags } from '@oclif/core';
import { reportStub } from '../../lib/stub.ts';

export default class AppCreate extends Command {
  static override summary = 'Create a local app source directory.';
  static override description =
    'Scaffolds an app project from @nocobase/app-template-default. The directory can live anywhere; it does not have to sit inside a hub.';

  static override examples = [
    '<%= config.bin %> <%= command.id %> crm',
    '<%= config.bin %> <%= command.id %> crm --dir ./apps/crm',
  ];

  static override args = {
    name: Args.string({
      description: 'App name, also used as the directory name by default.',
      required: true,
    }),
  };

  static override flags = {
    dir: Flags.string({
      description: 'Directory to create the app in. Defaults to ./<name>.',
    }),
    template: Flags.string({
      description: 'Template package to scaffold from.',
      default: '@nocobase/app-template-default',
    }),
  };

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(AppCreate);
    reportStub(this, { args, flags });
  }
}
