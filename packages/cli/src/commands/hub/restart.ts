import path from 'node:path';
import { Command, Flags } from '@oclif/core';
import { HUB_STATE_DIR, requireHubProject } from '../../lib/hub-project.ts';
import {
  clearProcessRecord,
  readProcessRecord,
  stopProcess,
} from '../../lib/process-store.ts';
import { failNotImplemented } from '../../lib/not-implemented.ts';
import { HUB_SERVER_UNAVAILABLE } from './start.ts';

export default class HubRestart extends Command {
  static override summary = 'Restart the hub.';
  static override description =
    'Stops the hub if it is running, then starts it again. Not implemented yet.';

  static override examples = ['<%= config.bin %> <%= command.id %>'];

  static override flags = {
    dir: Flags.string({
      description: 'Hub directory. Defaults to the current directory.',
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(HubRestart);
    const project = await requireHubProject(flags.dir);
    const stateDirectory = path.join(project.directory, HUB_STATE_DIR);
    const record = await readProcessRecord(stateDirectory);

    // Stopping works today, so a running hub is stopped before reporting that starting is not available. Leaving it
    // running would be worse: the user asked for a restart and would be told nothing happened while it still ran.
    if (record?.running) {
      await stopProcess(record.pid);
      await clearProcessRecord(stateDirectory);
      this.log(`Stopped "${project.config.name}" (pid ${record.pid}).`);
    }

    failNotImplemented(this, HUB_SERVER_UNAVAILABLE);
  }
}
