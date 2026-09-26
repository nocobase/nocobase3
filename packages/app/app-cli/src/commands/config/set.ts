import { type Command, Flags } from '@oclif/core';
import type { Interfaces } from '@oclif/core';

import { CommandError } from '../../command/errors.ts';
import { AppCommand, appContextOf } from '../../context.ts';
import { ConfigInitError, configErrorCode } from '../../lib/config-init.ts';
import {
  ConfigSetError,
  runConfigSet,
  type ConfigSetErrorReason,
  type ConfigSetResult,
} from '../../lib/config-set.ts';

/**
 * What `config set` reports. What the write left unconfirmed — a key an environment variable overrides, a
 * configuration that does not load yet, a secret given on the command line — is reported as warnings, which `--json`
 * carries in the envelope's `warnings`.
 */
export type AppConfigSetResult = Omit<ConfigSetResult, 'warnings'>;

/** Refusals caused by what was typed, which exit 2 like any other invalid usage. */
const INPUT_REASONS: ReadonlySet<ConfigSetErrorReason> = new Set([
  'invalid-assignment',
  'unknown-key',
  'environment-variable-missing',
]);

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
  } = {
    'from-env': Flags.boolean({
      default: false,
      description:
        'Read each value as the name of an environment variable, so it never appears on the command line.',
    }),
  };

  public async run(): Promise<AppConfigSetResult> {
    const { argv, flags } = await this.parse(AppConfigSet);
    let outcome: ConfigSetResult;

    try {
      outcome = await runConfigSet({
        rootDir: this.rootDir,
        assignments: argv.map(String),
        fromEnv: flags['from-env'],
        loadRuntime: () => appContextOf(this).loadRuntime(),
      });
    } catch (error) {
      throw toCommandError(error);
    }

    const { warnings, ...result } = outcome;
    this.log(`Updated ${result.configFile}: ${result.changed.join(', ')}.`);
    for (const warning of warnings) this.warn(warning);
    return result;
  }
}

/**
 * A refusal becomes a `CommandError` named after its reason, such as `UNKNOWN_KEY`. Input problems exit 2 and
 * operational ones exit 1, matching the other configuration commands.
 */
function toCommandError(error: unknown): CommandError {
  if (error instanceof ConfigSetError) {
    return new CommandError(error.message, {
      code: configErrorCode(error.reason),
      exit: INPUT_REASONS.has(error.reason) ? 2 : 1,
      suggestions: error.suggestion ? [error.suggestion] : [],
      details: error.details,
      cause: error,
    });
  }
  if (error instanceof ConfigInitError) {
    return new CommandError(error.message, {
      code: configErrorCode(error.reason),
      cause: error,
    });
  }
  return new CommandError(
    error instanceof Error ? error.message : String(error),
    { code: 'CONFIG_SET_FAILED', cause: error },
  );
}
