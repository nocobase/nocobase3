import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { Command, Flags } from '@oclif/core';
import type { Interfaces } from '@oclif/core';

export default class ScheduleSync extends Command {
  static override summary = 'Synchronize declared application schedules.';
  static override flags: {
    finalize: Interfaces.BooleanFlag<boolean>;
    json: Interfaces.BooleanFlag<boolean>;
  } = {
    finalize: Flags.boolean({
      default: false,
      description: 'Deactivate declarations missing from the source.',
    }),
    json: Flags.boolean({
      default: false,
      description: 'Print one machine-readable JSON result.',
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(ScheduleSync);
    const rootDir = process.cwd();
    const [{ resolveStandaloneAppRuntime }, { schedulerStartupModeToken }] =
      await Promise.all([
        import('@nocobase/app-server/node'),
        import('../server/providers/scheduler.js'),
      ]);
    const runtimeModule = await import(
      pathToFileURL(path.join(rootDir, 'server/runtime.js')).href
    );
    const appModule = await import(
      pathToFileURL(path.join(rootDir, 'server/app.js')).href
    );
    const runtime = await resolveStandaloneAppRuntime(runtimeModule.default, {
      rootDir,
    });
    const app = appModule.createApp(runtime);
    app.container.instance(schedulerStartupModeToken, {
      kind: 'sync-only',
      finalize: flags.finalize,
    });
    try {
      await app.start();
      const message = flags.finalize
        ? 'Schedule manifest synchronized and missing definitions deactivated.'
        : 'Schedule manifest synchronized.';
      if (flags.json) {
        this.logJson({ ok: true, status: 'success', finalize: flags.finalize });
      } else {
        this.log(message);
      }
    } finally {
      await app.shutdown();
    }
  }
}
