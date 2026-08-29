import { createInterface } from 'node:readline/promises';
import path from 'node:path';
import { Args, Command, Flags } from '@oclif/core';
import { findAppProject } from '../../lib/app-project.ts';
import { removeDirectory } from '../../lib/scaffold.ts';

export default class AppDestroy extends Command {
  static override summary = 'Delete a local app directory.';
  static override description =
    'Removes a local app and everything in it. Deleting an app from a hub is not supported yet.';

  static override examples = [
    '<%= config.bin %> <%= command.id %> ./crm',
    '<%= config.bin %> <%= command.id %> ./crm --yes',
  ];

  static override args = {
    dir: Args.string({
      description: 'App directory to delete.',
      required: true,
    }),
  };

  static override flags = {
    hub: Flags.string({
      // TODO: Delete the app from a hub. That needs an app API the v3 hub does not expose yet.
      description: 'Hub the app is deployed to. Reserved; not supported yet.',
    }),
    yes: Flags.boolean({
      char: 'y',
      default: false,
      description: 'Skip the confirmation prompt.',
    }),
  };

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(AppDestroy);

    if (flags.hub !== undefined) {
      this.error('Deleting an app from a hub is not supported yet.');
    }

    const target = path.resolve(args.dir);
    const project = await findAppProject(target);

    // Refuse anything that is not an app, and anything that merely sits inside one: resolving to a different directory
    // than the one asked for means the target itself has no `.nocobase/`, and deleting it would take out part of an app.
    if (!project || project.directory !== target) {
      this.error(
        [
          `"${target}" is not an app directory.`,
          'An app directory contains a .nocobase/config.json file. Pass the app root itself.',
        ].join('\n'),
      );
    }

    if (!flags.yes && !(await this.confirm(project.config.name, target))) {
      this.log('Cancelled.');
      return;
    }

    await removeDirectory(target);
    this.log(`Deleted ${project.config.name} (${target}).`);
  }

  private async confirm(name: string, target: string): Promise<boolean> {
    if (!process.stdin.isTTY) {
      this.error(
        'Refusing to delete without confirmation. Pass --yes to confirm.',
      );
    }

    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    try {
      const answer = await rl.question(
        `Delete "${name}" and everything in ${target}? Type the app name to confirm: `,
      );
      return answer.trim() === name;
    } finally {
      rl.close();
    }
  }
}
