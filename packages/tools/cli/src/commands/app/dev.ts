import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Command, Flags } from '@oclif/core';
import { requireAppProject } from '../../lib/app-project.ts';
import { detectPackageManager } from '../../lib/package-manager.ts';
import { runAttached } from '../../lib/run-command.ts';

export default class AppDev extends Command {
  static override summary = 'Start the app in local development mode.';
  static override description =
    "Runs the app's dev script with the package manager the project already uses. A hub is not required for local development.";

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
    const { flags } = await this.parse(AppDev);
    const project = await requireAppProject(flags.dir);
    const manifestPath = path.join(project.directory, 'package.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
      packageManager?: string;
      scripts?: Record<string, string>;
    };

    if (!manifest.scripts?.dev) {
      this.error(
        `"${project.config.name}" has no dev script in its package.json.`,
      );
    }

    const packageManager = await detectPackageManager(
      project.directory,
      manifest.packageManager,
    );
    const args = ['run', 'dev'];

    // Everything after `--` is forwarded to the script rather than consumed by the package manager.
    const forwarded = [
      ...(flags.port === undefined ? [] : ['--port', String(flags.port)]),
      ...(flags.host === undefined ? [] : ['--host', flags.host]),
    ];

    if (forwarded.length > 0) {
      args.push('--', ...forwarded);
    }

    this.log(`Starting ${project.config.name} with ${packageManager}...\n`);

    const exitCode = await runAttached(packageManager, args, {
      cwd: project.directory,
    });

    if (exitCode !== 0) {
      this.exit(exitCode);
    }
  }
}
