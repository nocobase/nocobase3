import { Command, Flags } from '@oclif/core';
import { resolveAppScript } from '../../lib/app-script.ts';
import { runAttached } from '../../lib/run-command.ts';

export default class AppBuild extends Command {
  static override summary = 'Build the app for production.';
  static override description =
    "Runs the app's build script with the package manager the project already uses. Run this before `nb3 app start`, which serves the build output rather than compiling on the fly.";

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --dir ./crm',
  ];

  static override flags = {
    dir: Flags.string({
      description: 'App directory. Defaults to the current directory.',
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(AppBuild);
    const { args, env, packageManager, project } = await resolveAppScript({
      dir: flags.dir,
      script: 'build',
    });

    this.log(`Building ${project.config.name} with ${packageManager}...\n`);

    const exitCode = await runAttached(packageManager, args, {
      cwd: project.directory,
      env,
    });

    // Set the exit code rather than throwing an oclif exit error: the script has already printed why it failed, and
    // oclif would print an `EEXIT: n` line of its own on top of it.
    process.exitCode = exitCode;
  }
}
