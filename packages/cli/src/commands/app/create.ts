import path from 'node:path';
import { Args, Command, Flags } from '@oclif/core';
import {
  assertTargetIsUsable,
  removeDirectory,
  scaffoldApp,
} from '../../lib/scaffold.ts';
import { DEFAULT_TEMPLATE, downloadTemplate } from '../../lib/template.ts';

export default class AppCreate extends Command {
  static override summary = 'Create a local app source directory.';
  static override description =
    'Downloads the app template and scaffolds a project from it. The directory can live anywhere; it does not have to sit inside a hub.';

  static override examples = [
    '<%= config.bin %> <%= command.id %> crm',
    '<%= config.bin %> <%= command.id %> crm --dir ./apps/crm',
    '<%= config.bin %> <%= command.id %> crm --template ./packages/app-template-default',
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
    }),
  };

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(AppCreate);
    const targetDirectory = path.resolve(flags.dir ?? args.name);

    await assertTargetIsUsable(targetDirectory);

    this.log(`Downloading template ${flags.template}...`);
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

    const relativeTarget = path.relative(process.cwd(), targetDirectory) || '.';

    this.log(
      `\nCreated ${args.name} from ${template.name}@${template.version}.\n`,
    );
    this.log('Next steps:');
    this.log(`  cd ${relativeTarget}`);
    this.log('  pnpm install');
    this.log(`  ${this.config.bin} app dev`);
  }
}
