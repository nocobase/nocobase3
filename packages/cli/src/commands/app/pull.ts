import { Args, Command, Flags } from '@oclif/core';
import {
  HUB_API_MISSING,
  failNotImplemented,
} from '../../lib/not-implemented.ts';

export default class AppPull extends Command {
  static override summary = 'Pull an existing app from a hub.';
  static override description =
    'Downloads an app that already exists in a hub so it can be developed locally. Not implemented yet.';

  static override examples = [
    '<%= config.bin %> <%= command.id %> crm ./crm',
    '<%= config.bin %> <%= command.id %> crm ./crm --hub http://localhost:3000',
  ];

  static override args = {
    name: Args.string({
      description: 'App name in the hub.',
      required: true,
    }),
    dir: Args.string({
      description: 'Local directory to pull into. Defaults to ./<name>.',
    }),
  };

  static override flags = {
    hub: Flags.string({
      description: 'Hub URL to pull from.',
    }),
  };

  public async run(): Promise<void> {
    await this.parse(AppPull);

    // TODO: Fetch the app source from the hub and record where it came from in .nb3/.
    failNotImplemented(this, HUB_API_MISSING);
  }
}
