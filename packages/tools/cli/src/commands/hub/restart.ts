import path from 'node:path';
import { Command, Flags } from '@oclif/core';
import { HUB_STATE_DIR, requireHubProject } from '../../lib/hub-project.ts';
import {
  clearProcessRecord,
  readProcessRecord,
  stopProcess,
} from '../../lib/process-store.ts';
import HubStart from './start.ts';

export default class HubRestart extends Command {
  static override summary = 'Restart the hub.';
  static override description =
    'Stops the hub if it is running, then starts it again.';

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --port 3100',
  ];

  static override flags = {
    dir: Flags.string({
      description: 'Hub directory. Defaults to the current directory.',
    }),
    port: Flags.integer({
      description:
        'Port to listen on. Defaults to the port recorded when the hub was created.',
    }),
    host: Flags.string({
      description:
        'Host to bind to. Defaults to the host recorded when the hub was created.',
    }),
  };

  public async run(): Promise<void> {
    const { argv, flags } = await this.parse(HubRestart);
    const project = await requireHubProject(flags.dir);
    const stateDirectory = path.join(project.directory, HUB_STATE_DIR);
    const record = await readProcessRecord(stateDirectory);

    if (record?.running) {
      await stopProcess(record.pid);
      this.log(`Stopped "${project.config.name}" (pid ${record.pid}).`);
    }

    // Cleared whether or not it was running, so a stale record cannot make the start below think a hub is already up.
    await clearProcessRecord(stateDirectory);

    await HubStart.run(argv as string[], this.config);
  }
}
