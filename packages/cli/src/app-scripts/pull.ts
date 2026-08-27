import os from 'node:os';
import path from 'node:path';
import { Command, Flags } from '@oclif/core';
import { requireAppProject } from '../lib/app-project.ts';
import { HubCredentialManager } from '../lib/hub-auth.ts';
import { failHubCommand } from '../lib/hub-command.ts';
import { normalizeHubUrl } from '../lib/hub-client.ts';
import { resolveApplication } from '../lib/hub-workflow.ts';
import {
  initializeSourceSnapshot,
  pullSourceSnapshot,
} from '../lib/source-repository.ts';
import { formatShellCommand } from '../lib/shell.ts';

export default class AppSyncPull extends Command {
  static override summary = 'Pull the latest source snapshot from the Hub.';
  static override description =
    'Synchronizes Hub source into the working directory while preserving local dependencies, build output, runtime data, secrets, and Hub association state.';

  static override examples = [
    'pnpm run pull',
    'pnpm run pull --hub https://hub.example.com/hub --json',
  ];

  static override flags = {
    dir: Flags.string({
      description: 'App directory. Defaults to the current directory.',
    }),
    hub: Flags.string({
      description: 'Public Hub root URL. Defaults to the app configuration.',
    }),
    app: Flags.string({
      description:
        'Exact application ID or slug. Defaults to the app configuration.',
    }),
    initialize: Flags.boolean({
      default: false,
      description: 'Initialize an empty directory from a Hub application.',
      hidden: true,
    }),
    'non-interactive': Flags.boolean({
      default: false,
      description:
        'Never prompt in the terminal. Browser authorization may still be required.',
    }),
    json: Flags.boolean({
      default: false,
      description: 'Print one JSON result to stdout.',
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(AppSyncPull);
    let hub: string | undefined = flags.hub;
    try {
      const project = flags.initialize
        ? undefined
        : await requireAppProject(flags.dir);
      if (flags.initialize && (!flags.dir || !flags.hub || !flags.app)) {
        throw new Error(
          'Initialization requires --dir, --hub, and --app. Example: pnpm create @nocobase/app crm --hub https://hub.example.com/hub --app sales',
        );
      }
      const normalizedHub = normalizeHubUrl(hub ?? project?.config.hub ?? '');
      hub = normalizedHub;
      const applicationReference =
        flags.app ?? project?.config.applicationId ?? project?.config.slug;
      if (!applicationReference) {
        throw new Error(
          'No Hub application is associated with this working copy. Pass --app <slug>.',
        );
      }
      const manager = new HubCredentialManager(normalizedHub);
      const result = await manager.authorizedWithDeviceLogin(
        ['apps:read', 'source:read'],
        {
          clientName: `NocoBase app scripts on ${os.hostname() || 'device'}`,
          reportAuthorization: (authorization) =>
            reportAuthorization(this, authorization, flags.json),
        },
        async (client, credential) => {
          const application = await resolveApplication(
            client,
            applicationReference,
          );
          const repository = await client.getRepository(application.id);
          const snapshot = flags.initialize
            ? await initializeSourceSnapshot({
                accessToken: credential.accessToken,
                application,
                destination: path.resolve(flags.dir!),
                hub: normalizedHub,
                repository,
              })
            : await pullSourceSnapshot({
                accessToken: credential.accessToken,
                hub: normalizedHub,
                project: project!,
                repository,
              });
          return { application, snapshot };
        },
      );
      if (flags.json) {
        this.log(
          JSON.stringify({
            ok: true,
            hub: normalizedHub,
            directory: flags.initialize
              ? path.resolve(flags.dir!)
              : project!.directory,
            application: {
              id: result.application.id,
              name: result.application.name,
              slug: result.application.slug,
            },
            changed: result.snapshot.changed,
            sourceCommit: result.snapshot.sourceCommit,
          }),
        );
        return;
      }
      this.log(
        result.snapshot.changed
          ? `Pulled ${result.application.slug} source from the Hub.`
          : `${result.application.slug} source is already up to date.`,
      );
      this.log(`source_commit: ${result.snapshot.sourceCommit}`);
    } catch (error) {
      failHubCommand(
        this,
        error,
        flags.json,
        formatShellCommand([
          'pnpm',
          'run',
          'pull',
          ...(flags.dir ? ['--dir', flags.dir] : []),
          ...(hub ? ['--hub', hub] : []),
          ...(flags.app ? ['--app', flags.app] : []),
          '--non-interactive',
        ]),
      );
    }
  }
}

function reportAuthorization(
  command: Command,
  authorization: import('../lib/hub-client.ts').DeviceAuthorization,
  json: boolean,
): void {
  const lines = [
    'Authorize this device in your browser:',
    authorization.verificationUriComplete ?? authorization.verificationUri,
    `Code: ${authorization.userCode}`,
    'Waiting for approval...',
  ];
  for (const line of lines) {
    if (json) command.logToStderr(line);
    else command.log(line);
  }
}
