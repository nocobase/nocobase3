import { Args, Command, Flags } from '@oclif/core';
import path from 'node:path';
import { writePulledAppConfig } from '../../lib/app-project.ts';
import { cloneHubRepository } from '../../lib/git.ts';
import { HubCredentialManager } from '../../lib/hub-auth.ts';
import { failHubCommand } from '../../lib/hub-command.ts';
import {
  HubApiError,
  type HubClient,
  normalizeHubUrl,
  type ApplicationSummary,
} from '../../lib/hub-client.ts';
import { assertTargetIsUsable } from '../../lib/scaffold.ts';
import { formatShellCommand } from '../../lib/shell.ts';

export default class AppPull extends Command {
  static override summary = 'Pull an existing app from a hub.';
  static override description =
    'Clones an app source repository from a Hub and records its remote identity in local .nocobase/config.json.';

  static override examples = [
    '<%= config.bin %> <%= command.id %> crm ./crm --hub http://127.0.0.1:13000/hub',
    '<%= config.bin %> <%= command.id %> crm ./crm --hub http://localhost:3000',
  ];

  static override args = {
    name: Args.string({
      description: 'Exact app slug in the Hub.',
      required: true,
    }),
    dir: Args.string({
      description: 'Local directory to pull into. Defaults to ./<name>.',
    }),
  };

  static override flags = {
    hub: Flags.string({
      description:
        'Public Hub root URL, including its base path (for example http://127.0.0.1:13000/hub).',
      required: true,
    }),
    'non-interactive': Flags.boolean({
      default: false,
      description: 'Never prompt for missing input.',
    }),
    json: Flags.boolean({
      default: false,
      description: 'Print one JSON result to stdout.',
    }),
  };

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(AppPull);
    const hub = normalizeHubUrl(flags.hub);
    const destination = path.resolve(args.dir ?? args.name);
    try {
      await assertTargetIsUsable(destination);
      const result = await new HubCredentialManager(hub).authorized(
        ['apps:read', 'source:read'],
        async (client, credential) => {
          const application = await findApplication(client, args.name);
          const repository = await client.getRepository(application.id);
          await cloneHubRepository({
            cloneUrl: repository.cloneUrl,
            destination,
            accessToken: credential.accessToken,
            branch: repository.defaultBranch,
            hub,
          });
          await writePulledAppConfig(destination, {
            applicationId: application.id,
            hub,
            name: application.name,
            repositoryMode: 'clone',
            slug: application.slug,
            sourceCommit: repository.headCommit,
          });
          return { application, repository };
        },
      );
      if (flags.json) {
        this.log(
          JSON.stringify({
            ok: true,
            hub,
            directory: destination,
            application: {
              id: result.application.id,
              slug: result.application.slug,
              name: result.application.name,
            },
            repository: {
              branch: result.repository.defaultBranch,
              headCommit: result.repository.headCommit,
            },
          }),
        );
        return;
      }
      this.log(`Pulled ${result.application.name} to ${destination}.`);
      this.log(`application_id: ${result.application.id}`);
      this.log(`slug: ${result.application.slug}`);
      this.log('Next steps:');
      this.log(
        `  ${formatShellCommand([
          'cd',
          path.relative(process.cwd(), destination) || '.',
        ])}`,
      );
      this.log('  pnpm install');
      this.log('  nb3 app dev');
    } catch (error) {
      failHubCommand(
        this,
        error,
        flags.json,
        formatShellCommand([
          'nb3',
          'app',
          'pull',
          args.name,
          destination,
          '--hub',
          hub,
          '--non-interactive',
        ]),
      );
    }
  }
}

async function findApplication(
  client: HubClient,
  slug: string,
): Promise<ApplicationSummary> {
  let offset = 0;
  for (;;) {
    const page = await client.listApplications({
      query: slug,
      limit: 100,
      offset,
    });
    const application = page.items.find((candidate) => candidate.slug === slug);
    if (application) return application;
    offset += page.items.length;
    if (page.items.length === 0 || offset >= page.meta.total) break;
  }
  throw new HubApiError(`Application "${slug}" was not found.`, {
    code: 'APPLICATION_NOT_FOUND',
    status: 404,
  });
}
