import { type Command, Flags } from '@oclif/core';
import type { Interfaces } from '@oclif/core';

import { AppCommand, appContextOf } from '../../context.ts';
import {
  ConfigSetError,
  runConfigSet,
  type ConfigSetResult,
} from '../../lib/config-set.ts';

export default class AppConfigSet extends AppCommand {
  static override summary =
    'Set values in the configuration file, keeping its comments.';
  static override description =
    'Sets one or more key=value assignments in the configuration file the application reads, and writes it once. Keys are dotted paths, such as database.connections.main.host; a key under a section the application does not know is refused with the nearest known one, so a typo fails here instead of being silently ignored. Values are read as YAML scalars — 13000 is a number, true a boolean, and quoting keeps text; lists and maps are edited in the file itself. With --from-env each value is the name of an environment variable to read instead, so a secret never appears on the command line. After writing, the configuration is loaded again, and any key whose effective value is not what was written — because an environment variable overrides it — is reported.';

  static override examples: Command.Example[] = [
    '<%= config.bin %> <%= command.id %> database.connections.main.host=db.internal database.connections.main.username=crm',
    '<%= config.bin %> <%= command.id %> --from-env database.connections.main.password=MAIN_DB_PASSWORD',
    '<%= config.bin %> <%= command.id %> i18n.defaultLocale=zh-CN --json',
  ];

  static override strict = false;

  static override flags: {
    'from-env': Interfaces.BooleanFlag<boolean>;
    json: Interfaces.BooleanFlag<boolean>;
  } = {
    'from-env': Flags.boolean({
      default: false,
      description:
        'Read each value as the name of an environment variable, so it never appears on the command line.',
    }),
    json: Flags.boolean({
      default: false,
      description: 'Print one machine-readable JSON result.',
    }),
  };

  public async run(): Promise<void> {
    const { argv, flags } = await this.parse(AppConfigSet);
    let result: ConfigSetResult;

    try {
      result = await runConfigSet({
        rootDir: appContextOf(this).rootDir,
        assignments: argv.map(String),
        fromEnv: flags['from-env'],
        loadRuntime: () => appContextOf(this).loadRuntime(),
      });
    } catch (error) {
      this.reportFailure(error, flags.json);
      return;
    }

    if (flags.json) {
      this.logJson({
        ok: true,
        status: 'updated',
        configFile: result.configFile,
        changed: result.changed,
        warnings: result.warnings,
      });
      return;
    }
    this.log(`Updated ${result.configFile}: ${result.changed.join(', ')}.`);
    for (const warning of result.warnings) this.log(`! ${warning}`);
  }

  /** Input problems exit 2 and operational ones exit 1, matching the other configuration commands. */
  private reportFailure(error: unknown, json: boolean): void {
    const setError = error instanceof ConfigSetError ? error : undefined;
    const message = error instanceof Error ? error.message : String(error);
    const input =
      setError?.reason === 'invalid-assignment' ||
      setError?.reason === 'unknown-key' ||
      setError?.reason === 'environment-variable-missing';

    if (json) {
      this.logJson({
        ok: false,
        status: 'failed',
        reason: setError?.reason ?? 'failed',
        error: message,
        ...(setError?.suggestedCommand
          ? { suggestedCommand: setError.suggestedCommand }
          : {}),
        ...(setError?.details ?? {}),
      });
    } else {
      this.log(message);
      if (setError?.suggestedCommand)
        this.log(`  ${setError.suggestedCommand}`);
    }
    this.exit(input ? 2 : 1);
  }
}
