import { type Command, Flags } from '@oclif/core';
import type { Interfaces } from '@oclif/core';

import { AppCommand } from '../context.js';
import {
  runConfigCheck,
  type ConfigCheckConnectMode,
  type ConfigCheckResult,
} from '../lib/config-check.js';

export default class AppConfigCheck extends AppCommand {
  static override summary =
    'Check the configuration the way a start would read it.';
  static override description =
    'Loads the configuration through the application itself — its files, its environment and its code defaults — without starting it, and reports what would stop it from starting or quietly misbehave: a file that does not parse, a database driver that is not installed, a secret that is missing or still the placeholder, a session secret that is regenerated on every start, a section name that nothing reads, and a ${NAME} reference that is used as literal text. Databases other than SQLite are also connected to, one connection each, taken from the pool and handed straight back; no SQL runs and nothing is migrated. Use --connect to include SQLite, or --no-connect to stay offline. Exits non-zero when any error is found, and with --strict when any warning is.';

  static override examples: Command.Example[] = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --json',
    '<%= config.bin %> <%= command.id %> --no-connect',
  ];

  static override flags: {
    connect: Interfaces.BooleanFlag<boolean | undefined>;
    strict: Interfaces.BooleanFlag<boolean>;
    json: Interfaces.BooleanFlag<boolean>;
  } = {
    connect: Flags.boolean({
      allowNo: true,
      description:
        'Connect to every database, SQLite included; --no-connect connects to none. By default every database but SQLite is connected to.',
    }),
    strict: Flags.boolean({
      default: false,
      description: 'Treat warnings as failures.',
    }),
    json: Flags.boolean({
      default: false,
      description: 'Print one machine-readable JSON result.',
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(AppConfigCheck);
    const connect: ConfigCheckConnectMode =
      flags.connect === undefined ? 'auto' : flags.connect ? 'always' : 'never';

    let result: ConfigCheckResult;
    try {
      result = await runConfigCheck({
        rootDir: this.appContext.rootDir,
        loadRuntime: () => this.appContext.loadRuntime(),
        connect,
      });
    } catch (error) {
      // Only an application that cannot be found at all ends up here; every problem with the configuration itself
      // is a finding.
      const message = error instanceof Error ? error.message : String(error);
      if (flags.json)
        this.logJson({ ok: false, status: 'failed', error: message });
      else this.log(message);
      this.exit(2);
      return;
    }

    const failed =
      !result.ok ||
      (flags.strict &&
        result.findings.some((finding) => finding.level === 'warning'));

    if (flags.json) {
      this.logJson({
        ok: !failed,
        status: failed ? 'failed' : 'passed',
        mode: result.mode,
        ...(result.configFile ? { configFile: result.configFile } : {}),
        findings: result.findings,
        connections: result.connections,
      });
    } else {
      this.report(result);
    }

    if (failed) this.exit(1);
  }

  private report(result: ConfigCheckResult): void {
    this.log(
      result.configFile
        ? `Checked ${result.configFile}`
        : 'Checked the configuration (no configuration file)',
    );
    for (const connection of result.connections) {
      if (connection.status === 'skipped') continue;
      this.log(
        `  ${connection.status === 'ok' ? '✓' : '✗'} database "${connection.name}" (${connection.dialect})`,
      );
    }
    if (result.findings.length === 0) {
      this.log('No problems found.');
      return;
    }
    for (const finding of result.findings) {
      this.log(
        `${finding.level === 'error' ? '✗' : '!'} ${finding.key ? `${finding.key}: ` : ''}${finding.message}`,
      );
      if (finding.fix) this.log(`    ${finding.fix}`);
    }
  }
}
