import { Args, type Command, type Interfaces } from '@oclif/core';

import { HubCliError } from '../../errors.ts';
import {
  assertRemoteName,
  parseRemoteUrl,
  readRemotes,
  REMOTES_FILE,
  writeRemotes,
} from '../../remotes.ts';
import { HubCommand } from '../hub-command.ts';

export interface RemoteAddResult {
  name: string;
  url: string;
  hub: string;
  appId: string;
  default: boolean;
}

export default class HubRemoteAdd extends HubCommand {
  static override summary = 'Add a Hub App to deploy this application to.';
  static override description = `Saves the remote in ${REMOTES_FILE}, which belongs in version control: it holds addresses only, never a key. The URL is the App's page on the Hub, <Hub URL>/apps/<App ID>. The first remote added becomes the default; change the default by editing "default" in the file. Nothing is sent to the Hub.`;

  static override examples: Command.Example[] = [
    '<%= config.bin %> <%= command.id %> origin https://hub.example/main/apps/crm',
    '<%= config.bin %> <%= command.id %> staging https://hub.example/main/apps/crm-staging',
  ];

  static override args: {
    name: Interfaces.Arg<string>;
    url: Interfaces.Arg<string>;
  } = {
    name: Args.string({
      required: true,
      description: 'Name of the remote, such as origin or production.',
    }),
    url: Args.string({
      required: true,
      description: "The App's URL on the Hub: <Hub URL>/apps/<App ID>.",
    }),
  };

  protected readonly failureCode = 'REMOTE_ADD_FAILED';
  protected readonly failureMessage = 'The remote could not be saved.';

  override async run(): Promise<RemoteAddResult> {
    const { args } = await this.parse(HubRemoteAdd);
    return await this.report(async () => {
      assertRemoteName(args.name);
      const target = parseRemoteUrl(args.url);
      const file = await readRemotes(this.rootDir);
      if (file.remotes[args.name] !== undefined)
        throw new HubCliError(
          'REMOTE_EXISTS',
          `Remote "${args.name}" already exists. Remove it with hub remote remove ${args.name} first.`,
          2,
        );
      file.remotes[args.name] = target.url;
      const isDefault = file.default === undefined;
      if (isDefault) file.default = args.name;
      await writeRemotes(this.rootDir, file);
      this.log(
        `Remote ${args.name} added: App ${target.appId} on ${target.hub}${isDefault ? ' (default)' : ''}.`,
      );
      return { name: args.name, ...target, default: isDefault };
    });
  }
}
