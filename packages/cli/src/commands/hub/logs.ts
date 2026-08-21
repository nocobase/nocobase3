import { Command, Flags } from '@oclif/core';
import { reportStub } from '../../lib/stub.ts';

export default class HubLogs extends Command {
  static override summary = 'Show hub logs.';

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --follow',
    '<%= config.bin %> <%= command.id %> --tail 200',
  ];

  static override flags = {
    dir: Flags.string({
      description: 'Hub directory. Defaults to the current directory.',
    }),
    follow: Flags.boolean({
      char: 'f',
      description: 'Keep streaming new log lines.',
      default: false,
    }),
    tail: Flags.integer({
      description: 'Number of recent log lines to show.',
      default: 100,
      min: 0,
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(HubLogs);
    reportStub(this, { flags });
  }
}
