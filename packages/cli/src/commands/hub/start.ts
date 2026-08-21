import { Command, Flags } from '@oclif/core';
import { reportStub } from '../../lib/stub.ts';

export default class HubStart extends Command {
  static override summary = 'Start the hub.';
  static override description =
    'Starts the hub in the current directory. Open the app console afterwards with `nb3 hub open`.';

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --port 3000',
  ];

  static override flags = {
    dir: Flags.string({
      description: 'Hub directory. Defaults to the current directory.',
    }),
    port: Flags.integer({ description: 'Port to listen on.' }),
    host: Flags.string({ description: 'Host to bind to.' }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(HubStart);
    reportStub(this, { flags });
  }
}
