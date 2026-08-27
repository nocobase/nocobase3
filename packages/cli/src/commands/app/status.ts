import { Command, Flags } from '@oclif/core';

import { HubCredentialManager } from '../../lib/hub-auth.ts';
import { failHubCommand } from '../../lib/hub-command.ts';
import { normalizeHubUrl } from '../../lib/hub-client.ts';
import {
  resolveApplication,
  resolveRemoteApplicationContext,
} from '../../lib/hub-workflow.ts';
import { formatShellCommand } from '../../lib/shell.ts';

export default class AppStatus extends Command {
  static override summary = 'Show an app status from its Hub.';
  static override description =
    'Shows the application, recent Releases, deployments, runtime state, and open URL.';

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --app sales --hub https://hub.example.com/hub',
    '<%= config.bin %> <%= command.id %> --dir ./sales --json',
  ];

  static override flags = {
    dir: Flags.string({
      description: 'App directory. Defaults to the current directory.',
    }),
    app: Flags.string({
      description: 'Application ID or exact slug. Defaults to the local app.',
    }),
    hub: Flags.string({
      description:
        'Public Hub root URL. Defaults to the local app configuration.',
    }),
    json: Flags.boolean({
      default: false,
      description: 'Print one JSON result to stdout.',
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(AppStatus);
    let hub: string | undefined = flags.hub;
    try {
      const context = await resolveRemoteApplicationContext({
        directory: flags.dir,
        hub: flags.hub,
        application: flags.app,
      });
      const normalizedHub = normalizeHubUrl(context.hub);
      hub = normalizedHub;
      const result = await new HubCredentialManager(normalizedHub).authorized(
        ['apps:read', 'releases:read', 'deployments:read', 'runtime:read'],
        async (client) => {
          const application = await resolveApplication(
            client,
            context.applicationReference,
          );
          const [releases, deployments] = await Promise.all([
            client.listReleases(application.id, { limit: 20 }),
            client.listDeployments(application.id, { limit: 20 }),
          ]);
          return { application, deployments, releases };
        },
      );
      const output = { ok: true, hub: normalizedHub, ...result };
      if (flags.json) {
        this.log(JSON.stringify(output));
        return;
      }
      const activeRelease = result.application.activeRelease?.version ?? '-';
      const runtime = result.application.runtime;
      this.log(`${result.application.name} (${result.application.slug})`);
      this.log(`application_id: ${result.application.id}`);
      this.log(`status: ${result.application.status}`);
      this.log(`active_release: ${activeRelease}`);
      this.log(
        `runtime: ${runtime ? `${runtime.state}/${runtime.health}` : '-'}`,
      );
      this.log(`url: ${result.application.links?.open ?? '-'}`);
      this.log(`recent_releases: ${result.releases.length}`);
      this.log(`recent_deployments: ${result.deployments.length}`);
    } catch (error) {
      const invocation =
        this.config.bin === 'pnpm run'
          ? ['pnpm', 'run', 'status']
          : ['nb3', 'app', 'status'];
      failHubCommand(
        this,
        error,
        flags.json,
        hub
          ? formatShellCommand([
              ...invocation,
              '--hub',
              hub,
              ...(flags.app ? ['--app', flags.app] : []),
              '--json',
            ])
          : `${invocation.join(' ')} --hub <hub-url> --app <slug> --json`,
      );
    }
  }
}
