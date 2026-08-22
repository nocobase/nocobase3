import { Command, Flags } from '@oclif/core';
import {
  HUB_API_MISSING,
  failNotImplemented,
} from '../../lib/not-implemented.ts';

export default class AppList extends Command {
  static override summary = 'List the apps in a hub.';
  static override description =
    'Lists the apps deployed to a hub. Not implemented yet.';

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --hub http://localhost:3000',
  ];

  static override flags = {
    hub: Flags.string({
      description: 'Hub URL to list apps from.',
    }),
    json: Flags.boolean({
      default: false,
      description: 'Print the result as JSON.',
    }),
  };

  public async run(): Promise<void> {
    await this.parse(AppList);

    // TODO: Query the hub for its deployed apps.
    failNotImplemented(this, HUB_API_MISSING);
  }
}
