import { Command, Flags } from '@oclif/core';
import { HubCredentialManager } from '../../lib/hub-auth.ts';
import { failHubCommand } from '../../lib/hub-command.ts';
import {
  normalizeHubUrl,
  type ApplicationSummary,
} from '../../lib/hub-client.ts';
import { formatShellCommand } from '../../lib/shell.ts';

export default class AppList extends Command {
  static override summary = 'List the apps in a hub.';
  static override description =
    'Lists the apps the saved Hub credential is currently allowed to read.';

  static override examples = [
    '<%= config.bin %> <%= command.id %> --hub http://127.0.0.1:13000/hub',
    '<%= config.bin %> <%= command.id %> --hub http://localhost:3000',
  ];

  static override flags = {
    hub: Flags.string({
      description:
        'Public Hub root URL, including its base path (for example http://127.0.0.1:13000/hub).',
      required: true,
    }),
    query: Flags.string({
      description: 'Match an app name, slug, or description.',
    }),
    status: Flags.string({
      description:
        'App status to include. Repeat to include multiple statuses.',
      multiple: true,
      options: ['active', 'archived'],
    }),
    sort: Flags.string({
      description: 'Sort field, optionally prefixed with a minus sign.',
      options: [
        'name',
        '-name',
        'slug',
        '-slug',
        'createdAt',
        '-createdAt',
        'updatedAt',
        '-updatedAt',
      ],
    }),
    limit: Flags.integer({
      default: 20,
      description: 'Maximum number of apps to return.',
      min: 1,
      max: 100,
    }),
    offset: Flags.integer({
      default: 0,
      description: 'Number of matching apps to skip.',
      min: 0,
    }),
    'non-interactive': Flags.boolean({
      default: false,
      description: 'Never prompt for missing input.',
    }),
    json: Flags.boolean({
      default: false,
      description: 'Print the result as JSON.',
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(AppList);
    const hub = normalizeHubUrl(flags.hub);
    try {
      const page = await new HubCredentialManager(hub).authorized(
        ['apps:read'],
        (client) =>
          client.listApplications({
            query: flags.query,
            statuses: flags.status as Array<'active' | 'archived'> | undefined,
            sort: flags.sort,
            limit: flags.limit,
            offset: flags.offset,
          }),
      );
      if (flags.json) {
        this.log(
          JSON.stringify({
            ok: true,
            hub,
            applications: page.items,
            pagination: page.meta,
            ...(page.requestId ? { requestId: page.requestId } : {}),
          }),
        );
        return;
      }
      this.printApplications(page.items);
      this.log(
        `Showing ${page.items.length} of ${page.meta.total} app${page.meta.total === 1 ? '' : 's'}.`,
      );
    } catch (error) {
      failHubCommand(
        this,
        error,
        flags.json,
        formatShellCommand(['nb3', 'app', 'list', '--hub', hub]),
      );
    }
  }

  private printApplications(applications: readonly ApplicationSummary[]): void {
    if (applications.length === 0) {
      this.log('No applications found.');
      return;
    }
    const rows = applications.map((application) => [
      application.slug,
      application.name,
      application.status,
      application.activeRelease?.version ?? '-',
      application.runtime?.state ?? '-',
      application.links?.open ?? '-',
    ]);
    const headings = ['SLUG', 'NAME', 'STATUS', 'RELEASE', 'RUNTIME', 'URL'];
    const widths = headings.map((heading, index) =>
      Math.max(heading.length, ...rows.map((row) => row[index]?.length ?? 0)),
    );
    this.log(
      headings
        .map((heading, index) => heading.padEnd(widths[index]))
        .join('  '),
    );
    for (const row of rows) {
      this.log(
        row.map((value, index) => value.padEnd(widths[index])).join('  '),
      );
    }
  }
}
