import { Command, Flags } from '@oclif/core';
import { reportStub } from '../../lib/stub.ts';

export default class AppDev extends Command {
  static override summary = 'Start the app in local development mode.';
  static override description =
    'Runs the app locally. A hub is not required for local development.';

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --port 3100',
  ];

  static override flags = {
    dir: Flags.string({
      description: 'App directory. Defaults to the current directory.',
    }),
    port: Flags.integer({ description: 'Port to listen on.' }),
    host: Flags.string({ description: 'Host to bind to.' }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(AppDev);
    reportStub(this, { flags });
  }
}
