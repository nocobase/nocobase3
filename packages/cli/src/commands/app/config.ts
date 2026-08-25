import { Args, Command, Flags } from '@oclif/core';
import { requireAppProject, writeAppConfig } from '../../lib/app-project.ts';
import type { AppConfig as StoredAppConfig } from '../../lib/scaffold.ts';

/** Keys a user may set. The rest of the config records where the app came from and is not meant to be edited. */
const WRITABLE_KEYS = new Set(['hub', 'name']);

export default class AppConfig extends Command {
  static override summary = 'Show or change app configuration.';
  static override description =
    'Reads and writes the app configuration stored in .nb3/. Prints all values when no key is given, prints one value when a key is given, and sets it when a value follows.';

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> hub',
    '<%= config.bin %> <%= command.id %> hub http://localhost:3000',
  ];

  static override args = {
    key: Args.string({
      description: 'Configuration key to read or write.',
    }),
    value: Args.string({
      description: 'New value. When given, the key is set to it.',
    }),
  };

  static override flags = {
    dir: Flags.string({
      description: 'App directory. Defaults to the current directory.',
    }),
    json: Flags.boolean({
      default: false,
      description: 'Print the result as JSON.',
    }),
  };

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(AppConfig);
    const project = await requireAppProject(flags.dir);
    const config = project.config as StoredAppConfig & Record<string, unknown>;

    if (args.key === undefined) {
      this.printAll(config, flags.json);
      return;
    }

    if (args.value === undefined) {
      this.printOne(config, args.key, flags.json);
      return;
    }

    if (!WRITABLE_KEYS.has(args.key)) {
      this.error(
        `"${args.key}" cannot be changed. Writable keys: ${[...WRITABLE_KEYS].sort().join(', ')}.`,
      );
    }

    config[args.key] = args.value;
    await writeAppConfig(project, config);
    this.log(`${args.key} = ${args.value}`);
  }

  /** Config values are usually strings, but format anything nested as JSON rather than as "[object Object]". */
  private format(value: unknown): string {
    return typeof value === 'object' && value !== null
      ? JSON.stringify(value)
      : String(value);
  }

  private printAll(config: Record<string, unknown>, json: boolean): void {
    if (json) {
      this.logJson(config);
      return;
    }

    const entries = Object.entries(config);
    const width = Math.max(...entries.map(([key]) => key.length));

    for (const [key, value] of entries) {
      this.log(`${key.padEnd(width)}  ${this.format(value)}`);
    }
  }

  private printOne(
    config: Record<string, unknown>,
    key: string,
    json: boolean,
  ): void {
    const value = config[key];

    if (value === undefined) {
      this.error(`"${key}" is not set.`);
    }

    if (json) {
      this.logJson(value);
      return;
    }

    this.log(this.format(value));
  }
}
