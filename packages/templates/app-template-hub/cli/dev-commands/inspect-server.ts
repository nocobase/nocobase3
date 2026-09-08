import { Command, Flags } from '@oclif/core';
import type { Interfaces } from '@oclif/core';

// The inspection itself lives in `scripts/inspect-server.mjs`, which exports it. This command is the command-line
// surface around that function, so the two never drift into separate implementations. It is loaded inside run() so
// that `--help` does not import the plugin declarations the inspection reads.

export default class AppInspectServer extends Command {
  static override summary = "Inspect this app's server plugin declarations.";
  static override description =
    'Imports server/plugins.ts and reports the declarations it resolves. Importing runs module initialization, but no Provider is constructed, no lifecycle or Route factory runs, and nothing connects to a database.';

  static override examples: Command.Example[] = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --json',
  ];

  static override flags: {
    json: Interfaces.BooleanFlag<boolean>;
  } = {
    json: Flags.boolean({
      default: false,
      description: 'Print one machine-readable JSON result.',
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(AppInspectServer);
    const { formatAppServerInspection, inspectAppServer } =
      await import('../../scripts/inspect-server.mjs');
    const inspection = await inspectAppServer();

    if (flags.json) {
      this.logJson({
        schemaVersion: 1,
        ok: true,
        operation: 'app:inspect:server',
        status: 'success',
        result: inspection,
      });
      return;
    }
    this.log(formatAppServerInspection(inspection));
  }
}
