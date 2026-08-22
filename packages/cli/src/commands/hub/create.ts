import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Args, Command, Flags } from '@oclif/core';
import {
  DEFAULT_HUB_HOST,
  DEFAULT_HUB_PORT,
  HUB_STATE_DIR,
  writeHubConfig,
} from '../../lib/hub-project.ts';
import { assertTargetIsUsable } from '../../lib/scaffold.ts';

const GITIGNORE = [
  'node_modules/',
  `${HUB_STATE_DIR}/logs/`,
  `${HUB_STATE_DIR}/cache/`,
  `${HUB_STATE_DIR}/*.pid`,
  '',
].join('\n');

export default class HubCreate extends Command {
  static override summary = 'Create a local hub.';
  static override description =
    'Creates a hub runtime directory. A hub is only needed to deploy and manage apps; local app development does not require one.';

  static override examples = [
    '<%= config.bin %> <%= command.id %> my-hub',
    '<%= config.bin %> <%= command.id %> my-hub --port 3100',
  ];

  static override args = {
    name: Args.string({
      description: 'Hub name, also used as the directory name by default.',
      required: true,
    }),
  };

  static override flags = {
    dir: Flags.string({
      description: 'Directory to create the hub in. Defaults to ./<name>.',
    }),
    port: Flags.integer({
      default: DEFAULT_HUB_PORT,
      description: 'Port the hub listens on.',
    }),
    host: Flags.string({
      default: DEFAULT_HUB_HOST,
      description: 'Host the hub binds to.',
    }),
  };

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(HubCreate);
    const directory = path.resolve(flags.dir ?? args.name);

    await assertTargetIsUsable(directory);

    // The runtime directories a hub needs. `app-dist` is where deployed apps land.
    for (const relative of [
      HUB_STATE_DIR,
      path.join(HUB_STATE_DIR, 'logs'),
      path.join(HUB_STATE_DIR, 'cache'),
      'app-dist',
    ]) {
      await mkdir(path.join(directory, relative), { recursive: true });
    }

    await writeFile(path.join(directory, 'app-dist', '.gitkeep'), '', 'utf8');
    await writeFile(path.join(directory, '.gitignore'), GITIGNORE, 'utf8');
    await writeHubConfig(directory, {
      host: flags.host,
      name: args.name,
      port: flags.port,
    });

    const relative = path.relative(process.cwd(), directory) || '.';

    this.log(`Created hub "${args.name}" in ${relative}.\n`);
    this.log('Next steps:');
    this.log(`  cd ${relative}`);
    this.log(`  ${this.config.bin} hub start`);
    this.log(
      `\nNote: the hub server package is not published yet, so \`${this.config.bin} hub start\` cannot run it. See \`${this.config.bin} hub start --help\`.`,
    );
  }
}
