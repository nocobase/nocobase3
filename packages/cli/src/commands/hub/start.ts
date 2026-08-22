import { Command, Flags } from '@oclif/core';
import { hubUrl, requireHubProject } from '../../lib/hub-project.ts';
import { failNotImplemented } from '../../lib/not-implemented.ts';

export const HUB_SERVER_UNAVAILABLE = [
  'The hub server package is not published yet, so there is nothing to run.',
  'It also declares its runtime dependencies under devDependencies and depends on an unpublished package, so a packed',
  'copy cannot be installed either. Publishing the hub package is what unblocks this.',
].join('\n');

export default class HubStart extends Command {
  static override summary = 'Start the hub.';
  static override description =
    'Starts the hub in the background and records its process, so it keeps running after the command returns. Not implemented yet.';

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --port 3100',
  ];

  static override flags = {
    dir: Flags.string({
      description: 'Hub directory. Defaults to the current directory.',
    }),
    port: Flags.integer({
      description:
        'Port to listen on. Defaults to the port recorded when the hub was created.',
    }),
    host: Flags.string({
      description:
        'Host to bind to. Defaults to the host recorded when the hub was created.',
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(HubStart);

    // Resolved first so the usual "not a hub" guidance still applies before the unsupported notice.
    const project = await requireHubProject(flags.dir);

    this.log(
      `Hub "${project.config.name}" would start at ${hubUrl(project.config)}.\n`,
    );

    // TODO: Spawn the hub server detached, write its pid through writeProcessRecord, and redirect output into
    // .nb3/logs/hub.log. The process, status, stop, and logs plumbing is already in place and waits only on a
    // runnable hub server package.
    failNotImplemented(this, HUB_SERVER_UNAVAILABLE);
  }
}
