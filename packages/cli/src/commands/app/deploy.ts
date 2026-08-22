import { Command, Flags } from '@oclif/core';
import { requireAppProject } from '../../lib/app-project.ts';
import {
  HUB_API_MISSING,
  failNotImplemented,
} from '../../lib/not-implemented.ts';

export default class AppDeploy extends Command {
  static override summary = 'Deploy the app to a hub.';
  static override description =
    'Deploys the app to the target hub. When --hub is omitted, the hub recorded in .nb3/ is used. Not implemented yet.';

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --hub http://localhost:3000',
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

    // Resolved first so the usual "not an app" guidance still applies before the unsupported notice.
    const project = await requireAppProject(flags.dir);
    const hub = flags.hub ?? project.config.hub;

    if (!hub) {
      this.error(
        [
          'No hub to deploy to.',
          `Pass --hub, or record one with \`${this.config.bin} app config hub <url>\`.`,
        ].join('\n'),
      );
    }

    // TODO: Build the app, pack the dist output, and upload it to the hub.
    failNotImplemented(this, HUB_API_MISSING);
  }
}
