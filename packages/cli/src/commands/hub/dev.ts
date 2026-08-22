import { Command, Flags } from '@oclif/core';
import { failNotImplemented } from '../../lib/not-implemented.ts';

export default class HubDev extends Command {
  static override summary = 'Start the hub in source development mode.';
  static override description =
    'Runs the hub from source, for working on the hub itself inside the NocoBase repository. Not implemented yet.';

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --port 3100',
    '<%= config.bin %> <%= command.id %> --hub-dir ./playground/hub',
  ];

  static override flags = {
    port: Flags.integer({
      description: 'Port to listen on.',
    }),
    host: Flags.string({
      description: 'Host to bind to.',
    }),
    'hub-dir': Flags.string({
      description: 'Hub development directory.',
    }),
    'portals-dir': Flags.string({
      description: 'Directory to discover deployed apps from.',
    }),
  };

  public async run(): Promise<void> {
    await this.parse(HubDev);

    // TODO: Run the hub's own dev script from a source checkout. The documented default is `playground/hub`, which
    // does not exist in this repository yet, so there is no directory to run against.
    failNotImplemented(
      this,
      [
        'It runs the hub from a source checkout, and the documented development directory (playground/hub) does not',
        'exist in this repository yet.',
      ].join('\n'),
    );
  }
}
