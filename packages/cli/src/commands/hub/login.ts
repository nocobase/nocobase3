import os from 'node:os';
import { Command, Flags } from '@oclif/core';
import { CredentialStore } from '../../lib/credential-store.ts';
import { authorizeDevice } from '../../lib/hub-auth.ts';
import { failHubCommand } from '../../lib/hub-command.ts';
import {
  AGENT_SCOPES,
  normalizeHubUrl,
  type AgentScope,
  type DeviceAuthorization,
} from '../../lib/hub-client.ts';

const DEFAULT_SCOPES: readonly AgentScope[] = [
  'profile',
  'apps:read',
  'releases:read',
  'deployments:read',
  'runtime:read',
];

export default class HubLogin extends Command {
  static override summary = 'Log in to a Hub for Coding Agent access.';
  static override description =
    'Starts device authorization, prints the Hub approval page, and saves the resulting Agent credential outside the app source directory.';

  static override examples = [
    '<%= config.bin %> <%= command.id %> --hub http://127.0.0.1:13000/hub',
    '<%= config.bin %> <%= command.id %> --hub https://hub.example.com/hub --scope releases:publish',
    '<%= config.bin %> <%= command.id %> --hub https://hub.example.com/hub --json',
  ];

  static override flags = {
    hub: Flags.string({
      description:
        'Public Hub root URL, including its base path (for example http://127.0.0.1:13000/hub).',
      required: true,
    }),
    scope: Flags.string({
      description:
        'Agent scope to request. Repeat for multiple scopes. Defaults to profile plus app, Release, deployment, and runtime read access.',
      multiple: true,
      options: [...AGENT_SCOPES],
    }),
    'non-interactive': Flags.boolean({
      default: false,
      description:
        'Never prompt in the terminal. Browser approval is still required.',
    }),
    json: Flags.boolean({
      default: false,
      description: 'Print one JSON result to stdout.',
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(HubLogin);
    const hub = normalizeHubUrl(flags.hub);
    const scopes = uniqueScopes(
      (flags.scope as AgentScope[] | undefined) ?? DEFAULT_SCOPES,
    );
    try {
      const credential = await authorizeDevice({
        hub,
        clientName: isAppScriptSurface(this)
          ? `NocoBase app scripts on ${os.hostname() || 'device'}`
          : `nb3 on ${os.hostname() || 'device'}`,
        scopes,
        reportAuthorization: (authorization) =>
          this.reportAuthorization(authorization, flags.json),
      });
      await new CredentialStore().set(credential);
      if (flags.json) {
        this.log(
          JSON.stringify({
            ok: true,
            hub,
            credentialId: credential.credentialId,
            scopes: credential.scopes,
            applicationScope: credential.applicationScope,
          }),
        );
        return;
      }
      this.log(`Logged in to ${hub}.`);
      this.log(`credential_id: ${credential.credentialId}`);
      this.log(`scopes: ${credential.scopes.join(' ')}`);
    } catch (error) {
      failHubCommand(this, error, flags.json, formatLoginHint(this, hub));
    }
  }

  private reportAuthorization(
    authorization: DeviceAuthorization,
    json: boolean,
  ): void {
    const lines = [
      'Authorize this device in your browser:',
      authorization.verificationUriComplete ?? authorization.verificationUri,
      `Code: ${authorization.userCode}`,
      'Waiting for approval...',
    ];
    for (const line of lines) {
      if (json) this.logToStderr(line);
      else this.log(line);
    }
  }
}

function formatLoginHint(command: Command, hub: string): string {
  if (isAppScriptSurface(command)) {
    return `pnpm run hub:login --hub ${hub}`;
  }
  return `nb3 hub login --hub ${hub}`;
}

function isAppScriptSurface(command: Command): boolean {
  return command.config.bin === 'pnpm run';
}

function uniqueScopes(scopes: readonly AgentScope[]): AgentScope[] {
  return [...new Set(scopes)];
}
