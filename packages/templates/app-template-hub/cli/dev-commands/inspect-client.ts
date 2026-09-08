import { Command, Flags } from '@oclif/core';
import type { Interfaces } from '@oclif/core';

// As with the server inspector, the logic stays in `scripts/inspect-client.mjs` and this is only its command-line
// surface. It is loaded inside run() because client inspection pulls in Vite and browser-only client modules, which
// must not be reached from a static import the server build would have to resolve.

const INSPECTION_TYPES = [
  'all',
  'config',
  'service-providers',
  'react-providers',
  'routes',
  'settings',
  'dev-routes',
  'locales',
] as const;

export default class AppInspectClient extends Command {
  static override summary =
    "Inspect this app's client runtime and plugin declarations.";
  static override description =
    'Imports declaration modules and evaluates lightweight contribution factories. It does not create a ClientApplication or run ServiceProvider lifecycle code.';

  static override examples: Command.Example[] = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --type routes',
    '<%= config.bin %> <%= command.id %> --json',
  ];

  static override flags: {
    type: Interfaces.OptionFlag<string, Interfaces.CustomOptions>;
    json: Interfaces.BooleanFlag<boolean>;
  } = {
    type: Flags.string({
      default: 'all',
      description: 'Which part of the client surface to report.',
      options: [...INSPECTION_TYPES],
    }),
    json: Flags.boolean({
      default: false,
      description: 'Print one machine-readable JSON result.',
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(AppInspectClient);
    const {
      createAppClientInspectionSuccess,
      formatAppClientInspection,
      inspectAppClient,
    } = await import('../../scripts/inspect-client.mjs');
    const inspection = await inspectAppClient();

    if (flags.json) {
      this.logJson(createAppClientInspectionSuccess(inspection, flags.type));
      return;
    }
    this.log(formatAppClientInspection(inspection, flags.type));
  }
}
