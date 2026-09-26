import { AppCommand } from '@nocobase/app-cli';
import { Flags } from '@oclif/core';
import type { Interfaces } from '@oclif/core';

/** What `scheduler sync` returns, and the `result` of its `--json` document. */
export interface ScheduleSyncResult {
  /** Whether declarations missing from the source were deactivated. */
  readonly finalize: boolean;
}

export default class ScheduleSync extends AppCommand {
  static override summary = 'Synchronize declared application schedules.';
  static override flags: {
    finalize: Interfaces.BooleanFlag<boolean>;
  } = {
    finalize: Flags.boolean({
      default: false,
      description: 'Deactivate declarations missing from the source.',
    }),
  };

  public async run(): Promise<ScheduleSyncResult> {
    const { flags } = await this.parse(ScheduleSync);
    // Loaded here rather than at the top of the file: the command tree imports this module for `--help` too.
    const { schedulerStartupModeToken } =
      await import('../server/providers/scheduler.js');
    await this.withApp(async ({ app }) => {
      // Starting in sync-only mode reconciles the manifest without leaving a worker behind.
      app.container.instance(schedulerStartupModeToken, {
        kind: 'sync-only',
        finalize: flags.finalize,
      });
      await app.start();
    });
    this.log(
      flags.finalize
        ? 'Schedule manifest synchronized and missing definitions deactivated.'
        : 'Schedule manifest synchronized.',
    );
    return { finalize: flags.finalize };
  }
}
