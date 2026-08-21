import { Command, Flags } from '@oclif/core';
import { reportStub } from '../../lib/stub.ts';

export default class HubDev extends Command {
  static override summary = 'Start the hub in source development mode.';
  static override description =
    'Runs the hub from source, for working on the hub itself inside the NocoBase repository. Deployed apps are discovered from the portals directory.';

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --port 3100',
    '<%= config.bin %> <%= command.id %> --hub-dir ./playground/hub --portals-dir ./playground/hub/app-dist',
  ];

  static override flags = {
    port: Flags.integer({ description: 'Port to listen on.' }),
    host: Flags.string({ description: 'Host to bind to.' }),
    'hub-dir': Flags.string({ description: 'Hub development directory.' }),
    'portals-dir': Flags.string({
      description: 'Directory to discover deployed apps from.',
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(HubDev);
    reportStub(this, { flags });
  }
}
