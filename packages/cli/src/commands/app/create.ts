import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { Args, Command, Flags } from '@oclif/core';
import { writePulledAppConfig } from '../../lib/app-project.ts';
import { cloneHubRepository } from '../../lib/git.ts';
import { HubCredentialManager } from '../../lib/hub-auth.ts';
import { failHubCommand } from '../../lib/hub-command.ts';
import { normalizeHubUrl } from '../../lib/hub-client.ts';
import {
  createOperation,
  loadOperation,
  updateOperation,
} from '../../lib/operation-store.ts';
import {
  assertTargetIsUsable,
  removeDirectory,
  scaffoldApp,
} from '../../lib/scaffold.ts';
import { formatShellCommand } from '../../lib/shell.ts';
import {
  DEFAULT_REGISTRY,
  DEFAULT_TEMPLATE,
  downloadTemplate,
} from '../../lib/template.ts';

export default class AppCreate extends Command {
  static override summary = 'Create a local app source directory.';
  static override description =
    'Downloads the app template and scaffolds a project from it. The directory can live anywhere; it does not have to sit inside a hub.';

  static override examples = [
    '<%= config.bin %> <%= command.id %> crm',
    '<%= config.bin %> <%= command.id %> crm --dir ./apps/crm',
    '<%= config.bin %> <%= command.id %> crm --template ./packages/app-template-default',
    '<%= config.bin %> <%= command.id %> crm --display-name "Sales CRM" --hub http://127.0.0.1:13000/hub --non-interactive',
  ];

  static override args = {
    name: Args.string({
      description: 'App name, also used as the directory name by default.',
      required: true,
    }),
  };

  static override flags = {
    dir: Flags.string({
      description: 'Directory to create the app in. Defaults to ./<name>.',
    }),
    template: Flags.string({
      description:
        'Template to scaffold from: a published package, or a path to a local package directory.',
      default: DEFAULT_TEMPLATE,
    }),
    registry: Flags.string({
      description: 'npm registry to download the template from.',
      default: DEFAULT_REGISTRY,
    }),
    'display-name': Flags.string({
      description: 'Display name for an app created in a Hub.',
    }),
    description: Flags.string({
      description: 'Description for an app created in a Hub.',
    }),
    hub: Flags.string({
      description: 'Public Hub root URL, including its base path.',
    }),
    'non-interactive': Flags.boolean({
      default: false,
      description: 'Never prompt for missing input.',
    }),
    json: Flags.boolean({
      default: false,
      description: 'Print one JSON result to stdout.',
    }),
    'operation-id': Flags.string({
      description: 'Resume or replay this operation with the same identifier.',
    }),
  };

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(AppCreate);
    const targetDirectory = path.resolve(flags.dir ?? args.name);

    if (flags.hub) {
      await this.createInHub(args.name, targetDirectory, {
        ...flags,
        hub: flags.hub,
      });
      return;
    }

    try {
      await assertTargetIsUsable(targetDirectory);

      if (!flags.json) this.log(`Downloading template ${flags.template}...`);
      const template = await downloadTemplate({
        registry: flags.registry,
        source: flags.template,
      });

      try {
        await scaffoldApp({
          name: args.name,
          targetDirectory,
          templateDirectory: template.directory,
          templateName: template.name,
          templateVersion: template.version,
        });
      } finally {
        await removeDirectory(template.directory);
      }

      const relativeTarget =
        path.relative(process.cwd(), targetDirectory) || '.';

      if (flags.json) {
        this.log(
          JSON.stringify({
            ok: true,
            name: args.name,
            directory: targetDirectory,
            template: { name: template.name, version: template.version },
          }),
        );
        return;
      }

      this.log(
        `\nCreated ${args.name} from ${template.name}@${template.version}.\n`,
      );
      this.log('Next steps:');
      this.log(`  ${formatShellCommand(['cd', relativeTarget])}`);
      this.log('  pnpm install');
      this.log(`  ${this.config.bin} app dev`);
    } catch (error) {
      if (flags.json) failHubCommand(this, error, true);
      throw error;
    }
  }

  private async createInHub(
    slug: string,
    targetDirectory: string,
    flags: {
      hub: string;
      'display-name'?: string;
      description?: string;
      json: boolean;
      'operation-id'?: string;
    },
  ): Promise<void> {
    const hub = normalizeHubUrl(flags.hub);
    const operationId = flags['operation-id'] ?? randomUUID();
    try {
      const operation = await createOperation({
        kind: 'app-create',
        operationId,
        hubUrl: hub,
        idempotencyKey: operationId,
        parameters: {
          requestFingerprint: createRequestFingerprint({
            description: flags.description,
            displayName: flags['display-name']?.trim() || slug,
            slug,
          }),
        },
        step: 'initialized',
      });
      await assertTargetIsUsable(targetDirectory);
      const result = await new HubCredentialManager(hub).authorized(
        ['apps:create', 'apps:read', 'source:read'],
        async (client, credential) => {
          const applicationId = operation.resourceIds?.applicationId;
          const application = applicationId
            ? await client.getApplication(applicationId)
            : await client.createApplication(
                {
                  slug,
                  name: flags['display-name']?.trim() || slug,
                  ...(flags.description
                    ? { description: flags.description }
                    : {}),
                },
                operationId,
              );
          await updateOperation(operationId, (current) => ({
            ...current,
            resourceIds: {
              applicationId: application.id,
              applicationSlug: application.slug,
            },
            step: 'application-created',
          }));
          const repository = await client.getRepository(application.id);
          await cloneHubRepository({
            cloneUrl: repository.cloneUrl,
            destination: targetDirectory,
            accessToken: credential.accessToken,
            branch: repository.defaultBranch,
            hub,
          });
          await writePulledAppConfig(targetDirectory, {
            applicationId: application.id,
            hub,
            name: application.name,
            repositoryMode: 'clone',
            slug: application.slug,
            sourceCommit: repository.headCommit,
          });
          await updateOperation(operationId, (current) => ({
            ...current,
            step: 'completed',
          }));
          return { application, repository };
        },
      );
      const output = {
        ok: true,
        operationId,
        hub,
        directory: targetDirectory,
        application: {
          id: result.application.id,
          slug: result.application.slug,
          name: result.application.name,
          url: result.application.links?.open ?? null,
        },
        repository: {
          branch: result.repository.defaultBranch,
          headCommit: result.repository.headCommit,
        },
      };
      if (flags.json) {
        this.log(JSON.stringify(output));
        return;
      }
      this.log(`Created ${result.application.name} in ${hub}.`);
      this.log(`application_id: ${result.application.id}`);
      this.log(`directory: ${targetDirectory}`);
      this.log(`operation_id: ${operationId}`);
    } catch (error) {
      const operation = await loadOperation(operationId).catch(() => undefined);
      const applicationId = operation?.resourceIds?.applicationId;
      const applicationSlug = operation?.resourceIds?.applicationSlug ?? slug;
      failHubCommand(
        this,
        error,
        flags.json,
        applicationId
          ? formatShellCommand([
              'nb3',
              'app',
              'pull',
              applicationSlug,
              targetDirectory,
              '--hub',
              hub,
              '--non-interactive',
            ])
          : formatShellCommand([
              'nb3',
              'app',
              'create',
              slug,
              '--hub',
              hub,
              '--dir',
              targetDirectory,
              '--operation-id',
              operationId,
              '--non-interactive',
            ]),
        operationId,
        {
          ...(applicationId
            ? { application: { id: applicationId, slug: applicationSlug } }
            : {}),
        },
      );
    }
  }
}

function createRequestFingerprint(input: {
  readonly description?: string;
  readonly displayName: string;
  readonly slug: string;
}): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        input.slug,
        input.displayName,
        input.description ?? null,
      ]),
    )
    .digest('hex');
}
