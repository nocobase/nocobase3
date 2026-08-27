import os from 'node:os';
import { Command, Flags } from '@oclif/core';
import { requireAppProject } from '../lib/app-project.ts';
import { HubCredentialManager } from '../lib/hub-auth.ts';
import { failHubCommand } from '../lib/hub-command.ts';
import { normalizeHubUrl } from '../lib/hub-client.ts';
import { resolveApplication } from '../lib/hub-workflow.ts';
import { pushSourceSnapshot } from '../lib/source-repository.ts';
import { formatShellCommand } from '../lib/shell.ts';

export default class AppSyncPush extends Command {
  static override summary = 'Push the current source snapshot to the Hub.';
  static override description =
    'Synchronizes application source without publishing local Git history, build output, dependencies, runtime data, or environment secrets.';

  static override examples = [
    'pnpm run push',
    'pnpm run push --hub https://hub.example.com/hub --json',
  ];

  static override flags = {
    dir: Flags.string({
      description: 'App directory. Defaults to the current directory.',
    }),
    hub: Flags.string({
      description: 'Public Hub root URL. Defaults to the app configuration.',
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
    const { flags } = await this.parse(AppSyncPush);
    let hub: string | undefined = flags.hub;
    try {
      const project = await requireAppProject(flags.dir);
      if (!project.config.applicationId && !project.config.slug) {
        throw new Error(
          'This app is not associated with a Hub application. Run `pnpm run deploy --hub <url>` once to create or associate it.',
        );
      }
      const normalizedHub = normalizeHubUrl(hub ?? project.config.hub ?? '');
      hub = normalizedHub;
      const manager = new HubCredentialManager(normalizedHub);
      const result = await manager.authorizedWithDeviceLogin(
        ['apps:read', 'source:read', 'source:write'],
        {
          clientName: `NocoBase app scripts on ${os.hostname() || 'device'}`,
          reportAuthorization: (authorization) =>
            reportAuthorization(this, authorization, flags.json),
        },
        async (client, credential) => {
          const application = await resolveApplication(
            client,
            project.config.applicationId ?? project.config.slug,
          );
          const repository = await client.getRepository(application.id);
          const snapshot = await pushSourceSnapshot({
            accessToken: credential.accessToken,
            hub: normalizedHub,
            project,
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
          ? `Pushed ${result.application.slug} source to the Hub.`
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
          'push',
          ...(flags.dir ? ['--dir', flags.dir] : []),
          ...(hub ? ['--hub', hub] : []),
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
