import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { Args, Command, Flags } from '@oclif/core';
import {
  DEFAULT_HUB_HOST,
  DEFAULT_HUB_PORT,
  HUB_STATE_DIR,
  type HubConfig,
} from '../../lib/hub-project.ts';
import {
  assertTargetIsUsable,
  removeDirectory,
  scaffoldFromTemplate,
} from '../../lib/scaffold.ts';
import { DEFAULT_HUB_TEMPLATE, downloadTemplate } from '../../lib/template.ts';

/** Runtime state a hub writes as it runs; none of it belongs in version control. */
const GITIGNORE_ADDITIONS = [
  '',
  '# nb3 hub runtime state',
  `${HUB_STATE_DIR}/logs/`,
  `${HUB_STATE_DIR}/cache/`,
  `${HUB_STATE_DIR}/*.pid`,
  '',
].join('\n');

export default class HubCreate extends Command {
  static override summary = 'Create a local hub.';
  static override description =
    'Downloads the hub package and scaffolds a hub from it. A hub is only needed to deploy and manage apps; local app development does not require one.';

  static override examples = [
    '<%= config.bin %> <%= command.id %> my-hub',
    '<%= config.bin %> <%= command.id %> my-hub --port 3100',
    '<%= config.bin %> <%= command.id %> my-hub --template ./packages/hub',
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
    template: Flags.string({
      default: DEFAULT_HUB_TEMPLATE,
      description:
        'Template to scaffold from: a published package, or a path to a local package directory.',
    }),
    registry: Flags.string({
      description: 'npm registry to download the template from.',
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

    this.log(`Downloading template ${flags.template}...`);
    const template = await downloadTemplate({
      registry: flags.registry,
      source: flags.template,
    });
    const config: HubConfig = {
      host: flags.host,
      name: args.name,
      port: flags.port,
    };

    try {
      await scaffoldFromTemplate({
        extraFiles: {
          [path.join(HUB_STATE_DIR, 'hub.json')]:
            `${JSON.stringify(config, null, 2)}\n`,
          [path.join('app-dist', '.gitkeep')]: '',
        },
        name: args.name,
        targetDirectory: directory,
        templateDirectory: template.directory,
      });
    } finally {
      await removeDirectory(template.directory);
    }

    // The runtime directories the hub writes into. They are gitignored, so they need creating rather than committing.
    for (const relative of [
      path.join(HUB_STATE_DIR, 'logs'),
      path.join(HUB_STATE_DIR, 'cache'),
    ]) {
      await mkdir(path.join(directory, relative), { recursive: true });
    }

    await this.appendGitignore(directory);

    const relative = path.relative(process.cwd(), directory) || '.';

    this.log(
      `\nCreated hub "${args.name}" from ${template.name}@${template.version}.\n`,
    );
    this.log('Next steps:');
    this.log(`  cd ${relative}`);
    this.log('  pnpm install');
    this.log(`  ${this.config.bin} hub start`);
  }

  private async appendGitignore(directory: string): Promise<void> {
    await appendFile(
      path.join(directory, '.gitignore'),
      GITIGNORE_ADDITIONS,
      'utf8',
    );
  }
}
