import { type Command, Flags } from '@oclif/core';
import type { Interfaces } from '@oclif/core';

import {
  OFFICIAL_DIALECTS,
  type OfficialDialect,
} from '@nocobase/app-server/database';

import { AppCommand } from '../context.js';
import {
  ConfigInitError,
  runConfigInit,
  type ConfigInitResult,
} from '../lib/config-init.js';
import {
  confirmWriteAnyway,
  promptConnection,
  selectDialect,
} from '../lib/prompts.js';

export default class AppConfigInit extends AppCommand {
  static override summary =
    'Write the configuration file this application starts from.';
  static override description =
    "Generates config.yml from the application's config.example.yml, keeping its comments, filling in auth.secret and session.secret, and pointing database.connections.main at the selected dialect. It never installs anything: the database driver decides which dialects this application can run on, so install it first with pnpm add and run this afterwards. Connection settings are generated with placeholder values for the selected dialect; edit them for the target database before starting. Everything is checked before anything is written, so a run that reports a problem leaves the directory untouched and can simply be repeated. Not for applications hosted by a Hub, which receive their configuration from it.";

  static override examples: Command.Example[] = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --dialect postgres',
    '<%= config.bin %> <%= command.id %> --dialect sqlite --json',
  ];

  static override flags: {
    dialect: Interfaces.OptionFlag<string | undefined>;
    config: Interfaces.OptionFlag<string | undefined>;
    force: Interfaces.BooleanFlag<boolean>;
    json: Interfaces.BooleanFlag<boolean>;
  } = {
    dialect: Flags.string({
      options: [...OFFICIAL_DIALECTS],
      description:
        'Dialect for the main connection. Defaults to the installed driver when there is exactly one; required when there is no terminal to ask on.',
    }),
    config: Flags.string({
      description:
        'Write to this path instead of the default, resolved the same way as APP_CONFIG_FILE.',
    }),
    force: Flags.boolean({
      default: false,
      description: 'Replace an existing configuration file.',
    }),
    json: Flags.boolean({
      default: false,
      description: 'Print one machine-readable JSON result.',
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(AppConfigInit);
    const interactive = flags.json === false && process.stdin.isTTY === true;
    let result: ConfigInitResult;

    try {
      result = await runConfigInit({
        rootDir: this.appContext.rootDir,
        dialect: flags.dialect,
        configPath: flags.config,
        force: flags.force,
        selectDialect: interactive
          ? (available: readonly OfficialDialect[]) => selectDialect(available)
          : undefined,
        readConfiguredDialect: () => this.readConfiguredDialect(),
        askConnection: interactive
          ? (dialect, defaults) => promptConnection(dialect, defaults)
          : undefined,
        onConnectionTested: interactive
          ? async (tested) => {
              if (tested.status === 'ok') {
                this.log(`✓ Connected to the ${tested.dialect} database.`);
                return true;
              }
              this.log(
                `✗ Could not connect: ${tested.reason ?? 'unknown error'}`,
              );
              return confirmWriteAnyway();
            }
          : undefined,
      });
    } catch (error) {
      this.reportFailure(error, flags.json);
      return;
    }

    if (flags.json) {
      this.logJson({
        ok: true,
        status: result.status,
        mode: result.mode,
        ...(result.dialect ? { dialect: result.dialect } : {}),
        configFile: result.configFile,
        configKey: result.configKey,
        overriddenByEnvironment: result.overriddenByEnvironment,
        requiredSettings: result.requiredSettings,
        nextCommands: result.nextCommands,
        ...(result.connectionTest
          ? { connectionTest: result.connectionTest }
          : {}),
      });
      return;
    }

    if (result.status === 'unchanged') {
      this.log(
        `Already configured: ${result.configFile}. Edit it with pnpm config:set, or run with --force to replace it.`,
      );
      return;
    }
    this.log(`Wrote ${result.configFile} for ${result.dialect}.`);
    if (result.requiredSettings.length > 0) {
      this.log(
        `Set these for your database before starting: ${result.requiredSettings.join(', ')}.`,
      );
      this.log(
        '  For example: pnpm config:set database.connections.main.host=<host>, and pnpm config:set --from-env database.connections.main.password=<VARIABLE>',
      );
    }
    if (result.overriddenByEnvironment.length > 0) {
      // Environment values are applied after the file, so the secrets just written are not the ones that will be used.
      this.log(
        `Note: ${result.overriddenByEnvironment.join(' and ')} are set in this environment and override the file.`,
      );
    }
  }

  /**
   * The dialect the existing configuration uses, read through the application rather than from the file, so a dialect
   * that only its code defaults set is seen too. Unknown when the configuration does not load.
   */
  private async readConfiguredDialect(): Promise<string | undefined> {
    const runtime = await this.appContext.loadRuntime();
    try {
      const database = runtime.config.get<{
        default?: string;
        connections?: Record<string, { dialect?: unknown }>;
      }>('database');
      const name = database?.default ?? 'main';
      const dialect = database?.connections?.[name]?.dialect;
      return typeof dialect === 'string' ? dialect : undefined;
    } finally {
      await runtime.scope.destroy();
    }
  }

  /** Input problems exit 2 and operational ones exit 1, matching the create command. */
  private reportFailure(error: unknown, json: boolean): void {
    const configError = error instanceof ConfigInitError ? error : undefined;
    const message = error instanceof Error ? error.message : String(error);
    const exitCode = configError?.reason === 'unknown-dialect' ? 2 : 1;

    if (json) {
      this.logJson({
        ok: false,
        status: 'failed',
        reason: configError?.reason ?? 'failed',
        error: message,
        ...(configError?.suggestedCommand
          ? { suggestedCommand: configError.suggestedCommand }
          : {}),
        ...(configError?.details ?? {}),
      });
    } else {
      this.log(message);
      if (configError?.suggestedCommand) {
        this.log(`  ${configError.suggestedCommand}`);
      }
    }

    this.exit(exitCode);
  }
}
