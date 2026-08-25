import { Command, Flags } from '@oclif/core';
import { resolveAppScript } from '../../lib/app-script.ts';
import { runAttached } from '../../lib/run-command.ts';

export default class AppStart extends Command {
  static override summary = 'Start the app in production mode.';
  static override description =
    "Runs the app's start script, which serves what `nb3 app build` produced. Build first: unlike `nb3 app dev`, this does not compile sources, and starting without a build fails.";

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --dir ./crm',
    '<%= config.bin %> <%= command.id %> --port 3100',
  ];

  static override flags = {
    dir: Flags.string({
      description: 'App directory. Defaults to the current directory.',
    }),
    port: Flags.integer({
      description: 'Port to listen on.',
    }),
    host: Flags.string({
      description: 'Host to bind to.',
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(AppStart);
    const { args, env, packageManager, project } = await resolveAppScript({
      address: { host: flags.host, port: flags.port },
      dir: flags.dir,
      script: 'start',
    });

    this.log(`Starting ${project.config.name} with ${packageManager}...\n`);

    const exitCode = await runAttached(packageManager, args, {
      cwd: project.directory,
      env,
    });

    // Set the exit code rather than throwing an oclif exit error: the script has already printed why it failed, and
    // oclif would print an `EEXIT: n` line of its own on top of it.
    process.exitCode = exitCode;
  }
}
