import path from 'node:path';
import { Command, Flags } from '@oclif/core';
import { HUB_STATE_DIR, requireHubProject } from '../../lib/hub-project.ts';
import {
  clearProcessRecord,
  readProcessRecord,
  stopProcess,
} from '../../lib/process-store.ts';

export default class HubStop extends Command {
  static override summary = 'Stop the hub.';
  static override description =
    'Asks the hub to shut down, and forces it if it does not stop in time.';

  static override examples = ['<%= config.bin %> <%= command.id %>'];

  static override flags = {
    dir: Flags.string({
      description: 'Hub directory. Defaults to the current directory.',
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(HubStop);
    const project = await requireHubProject(flags.dir);
    const stateDirectory = path.join(project.directory, HUB_STATE_DIR);
    const record = await readProcessRecord(stateDirectory);

    if (!record) {
      this.log(`"${project.config.name}" is not running.`);
      return;
    }

    if (!record.running) {
      // The recorded process is gone, so the file is stale. Clearing it keeps `status` honest.
      await clearProcessRecord(stateDirectory);
      this.log(
        `"${project.config.name}" is not running. Cleared a stale record for pid ${record.pid}.`,
      );
      return;
    }

    const result = await stopProcess(record.pid);
    await clearProcessRecord(stateDirectory);

    this.log(
      result.stopped
        ? `Stopped "${project.config.name}" (pid ${record.pid}).`
        : `"${project.config.name}" was already gone (pid ${record.pid}).`,
    );
  }
}
