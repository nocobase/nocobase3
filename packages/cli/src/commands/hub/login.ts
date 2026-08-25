import os from 'node:os';
import { Command, Flags } from '@oclif/core';
import {
  CredentialStore,
  type StoredCredential,
} from '../../lib/credential-store.ts';
import { HUB_CLI_CLIENT_ID, parseScope } from '../../lib/hub-auth.ts';
import { failHubCommand } from '../../lib/hub-command.ts';
import {
  AGENT_SCOPES,
  HubApiError,
  HubClient,
  normalizeHubUrl,
  type AgentScope,
  type AgentToken,
  type DeviceAuthorization,
} from '../../lib/hub-client.ts';

const DEFAULT_SCOPES: readonly AgentScope[] = [
  'profile',
  'apps:read',
  'source:read',
];

export default class HubLogin extends Command {
  static override summary = 'Log in to a Hub for Coding Agent access.';
  static override description =
    'Starts device authorization, prints the Hub approval page, and saves the resulting Agent credential in the nb3 user data directory.';

  static override examples = [
    '<%= config.bin %> <%= command.id %> --hub http://127.0.0.1:13000/hub',
    '<%= config.bin %> <%= command.id %> --hub https://hub.example.com/hub --scope source:write',
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
        'Agent scope to request. Repeat for multiple scopes. Defaults to profile, apps:read, and source:read.',
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
    const client = new HubClient(hub);
    try {
      const authorization = await client.createDeviceAuthorization({
        clientId: HUB_CLI_CLIENT_ID,
        clientName: `nb3 on ${os.hostname() || 'device'}`,
        scopes,
        applicationScope: { mode: 'all-authorized' },
      });
      this.reportAuthorization(authorization, flags.json);
      const token = await pollForToken(client, authorization);
      const now = Date.now();
      const credential: StoredCredential = {
        hub,
        clientId: HUB_CLI_CLIENT_ID,
        credentialId: token.credentialId,
        accessToken: token.accessToken,
        accessTokenExpiresAt: now + token.expiresIn * 1000,
        refreshToken: token.refreshToken,
        refreshTokenExpiresAt: now + token.refreshExpiresIn * 1000,
        scopes: parseScope(token.scope),
        applicationScope: token.applicationScope,
      };
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
      failHubCommand(this, error, flags.json, `nb3 hub login --hub ${hub}`);
    }
  }

  private reportAuthorization(
    authorization: DeviceAuthorization,
    json: boolean,
  ): void {
    const lines = [
      'Authorize this nb3 device in your browser:',
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

async function pollForToken(
  client: HubClient,
  authorization: DeviceAuthorization,
): Promise<AgentToken> {
  const deadline = Date.now() + authorization.expiresIn * 1000;
  let intervalMs = authorization.interval * 1000;
  while (Date.now() < deadline) {
    try {
      return await client.exchangeToken({
        grantType: 'urn:ietf:params:oauth:grant-type:device_code',
        clientId: HUB_CLI_CLIENT_ID,
        deviceCode: authorization.deviceCode,
      });
    } catch (error) {
      if (!(error instanceof HubApiError)) throw error;
      if (error.code === 'SLOW_DOWN') intervalMs += 5_000;
      else if (error.code !== 'AUTHORIZATION_PENDING') throw error;
      await wait(intervalMs);
    }
  }
  throw new HubApiError('Device authorization expired before approval.', {
    code: 'DEVICE_AUTHORIZATION_EXPIRED',
    status: 410,
  });
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function uniqueScopes(scopes: readonly AgentScope[]): AgentScope[] {
  return [...new Set(scopes)];
}
