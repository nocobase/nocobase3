import { createApp } from '@nocobase/create-app';
import { CREATE_ARGS, CREATE_FLAGS } from '@nocobase/create-app/flags';
import { Command } from '@oclif/core';

export default class AppCreate extends Command {
  static override summary = 'Create a local App with the official scaffold.';
  static override description =
    'Delegates to @nocobase/create-app so pnpm create and nb3 create the same project shape, database configuration, and native-driver setup.';

  static override examples = [
    '<%= config.bin %> <%= command.id %> crm --db-dialect=sqlite',
    '<%= config.bin %> <%= command.id %> crm --db-dialect=postgres',
    '<%= config.bin %> <%= command.id %> crm --template ./packages/app-template-default',
  ];

  static override args = CREATE_ARGS;
  static override flags = CREATE_FLAGS;

  public async run(): Promise<void> {
    const exitCode = await createApp({
      argv: this.argv,
      binary: `${this.config.bin} app create`,
      version: this.config.version,
    });

    if (exitCode !== 0) {
      this.exit(exitCode);
    }
  }
}
