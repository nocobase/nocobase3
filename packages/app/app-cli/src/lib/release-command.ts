// What `release upload` and `release deploy` share: one JSON document per run, success or failure, on stdout, and error
// messages that never repeat a credential.
//
// Every failure message comes from a fixed string. A parse failure names only declared flags (`describeArgumentError`),
// a publishing failure carries the message `publishToHub` chose, and anything else is reported by code alone because
// its message may quote a request, a response or an environment value. `NOCOBASE_CLI_DEBUG` prints that cause to
// stderr, for a person at a terminal who has opted in to seeing it.
import { AppCommand } from '../context.ts';
import {
  PublishingError,
  publishToHub,
  type PublishingOptions,
} from '../hub-publishing.ts';
import { describeArgumentError } from './argument-error.ts';

export type ReleaseOperation = 'upload' | 'deploy';

export interface ReleaseFlags extends PublishingOptions {
  readonly json: boolean;
}

export abstract class ReleaseCommand extends AppCommand {
  protected abstract readonly operation: ReleaseOperation;
  /** The code reported for a failure that is not a `PublishingError`. */
  protected abstract readonly failureCode: string;
  protected abstract readonly failureMessage: string;

  protected abstract parseFlags(): Promise<ReleaseFlags>;
  /** The one-line summary printed without `--json`. */
  protected abstract describe(result: Record<string, unknown>): string;

  override async run(): Promise<void> {
    const operation = `release:${this.operation}`;
    let parsed = false;
    let json = this.argv.includes('--json');
    try {
      const flags = await this.parseFlags();
      parsed = true;
      json = flags.json;
      const result = await publishToHub(
        this.operation,
        flags,
        this.appContext.rootDir,
      );
      if (json) {
        this.logJson({
          schemaVersion: 1,
          ok: true,
          operation,
          status: 'success',
          result,
        });
        return;
      }
      this.log(this.describe(result));
      if (typeof result.warning === 'string') this.warn(result.warning);
    } catch (error) {
      const failure = this.toFailure(error, parsed);
      if (json) {
        this.logJson({
          schemaVersion: 1,
          ok: false,
          operation,
          status: 'failure',
          error: {
            code: failure.code,
            message: failure.message,
            suggestions: [],
          },
        });
      } else {
        this.log(failure.message);
      }
      this.exit(failure.exitCode);
    }
  }

  private toFailure(error: unknown, parsed: boolean): PublishingError {
    if (!parsed) {
      const flags = Object.keys(
        (this.constructor as typeof ReleaseCommand).flags ?? {},
      );
      return new PublishingError(
        'INVALID_ARGUMENTS',
        describeArgumentError(error, flags),
        2,
      );
    }
    if (error instanceof PublishingError) return error;
    if (process.env.NOCOBASE_CLI_DEBUG) {
      this.logToStderr(
        error instanceof Error ? (error.stack ?? error.message) : String(error),
      );
    }
    return new PublishingError(
      this.failureCode,
      `${this.failureMessage} Set NOCOBASE_CLI_DEBUG=1 to print the cause.`,
      1,
    );
  }
}
