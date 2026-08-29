import { Command, Flags } from '@oclif/core';
import { CredentialStore } from '../../lib/credential-store.ts';
import { HUB_CLI_CLIENT_ID } from '../../lib/hub-auth.ts';
import { failHubCommand } from '../../lib/hub-command.ts';
import { HubClient, normalizeHubUrl } from '../../lib/hub-client.ts';

export default class HubLogout extends Command {
  static override summary = 'Log out of a Hub and revoke the saved credential.';
  static override description =
    'Revokes the current Agent refresh-token family on the Hub, then removes the locally saved credential.';

  static override examples = [
    '<%= config.bin %> <%= command.id %> --hub http://127.0.0.1:13000/hub',
    '<%= config.bin %> <%= command.id %> --hub https://hub.example.com/hub --json',
  ];

  static override flags = {
    hub: Flags.string({
      description:
        'Public Hub root URL, including its base path (for example http://127.0.0.1:13000/hub).',
      required: true,
    }),
    json: Flags.boolean({
      default: false,
      description: 'Print one JSON result to stdout.',
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(HubLogout);
    const hub = normalizeHubUrl(flags.hub);
    const store = new CredentialStore();
    try {
      const credential = await store.get(hub);
      if (!credential) {
        this.printResult(hub, true, flags.json);
        return;
      }
      await new HubClient(hub).revoke(
        credential.refreshToken,
        credential.clientId ?? HUB_CLI_CLIENT_ID,
      );
      await store.remove(hub);
      this.printResult(hub, false, flags.json);
    } catch (error) {
      failHubCommand(
        this,
        error,
        flags.json,
        this.config.bin === 'pnpm run'
          ? `pnpm run hub:logout --hub ${hub}`
          : `nb3 hub logout --hub ${hub}`,
      );
    }
  }

  private printResult(
    hub: string,
    alreadyLoggedOut: boolean,
    json: boolean,
  ): void {
    if (json) {
      this.log(JSON.stringify({ ok: true, hub, alreadyLoggedOut }));
      return;
    }
    this.log(
      alreadyLoggedOut
        ? `No saved credential exists for ${hub}.`
        : `Logged out of ${hub}.`,
    );
  }
}
