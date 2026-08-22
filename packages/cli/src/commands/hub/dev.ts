import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Command, Flags } from '@oclif/core';
import { hubUrl, requireHubProject } from '../../lib/hub-project.ts';
import { detectPackageManager } from '../../lib/package-manager.ts';
import { runAttached } from '../../lib/run-command.ts';

export default class HubDev extends Command {
  static override summary = 'Start the hub in development mode.';
  static override description =
    "Runs the hub's dev script in this terminal, for working on the hub itself. Unlike `hub start`, it stays attached so reload output is visible.";

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --port 3100',
    '<%= config.bin %> <%= command.id %> --hub-dir ./my-hub',
  ];

  static override flags = {
    'hub-dir': Flags.string({
      description: 'Hub directory. Defaults to the current directory.',
    }),
    port: Flags.integer({
      description: 'Port to listen on.',
    }),
    host: Flags.string({
      description: 'Host to bind to.',
    }),
    'portals-dir': Flags.string({
      description:
        'Directory to discover deployed apps from. Defaults to app-dist inside the hub.',
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(HubDev);
    const project = await requireHubProject(flags['hub-dir']);
    const manifest = JSON.parse(
      await readFile(path.join(project.directory, 'package.json'), 'utf8'),
    ) as {
      packageManager?: string;
      scripts?: Record<string, string>;
    };

    if (!manifest.scripts?.dev) {
      this.error(
        `"${project.config.name}" has no dev script in its package.json.`,
      );
    }

    const host = flags.host ?? project.config.host;
    const port = flags.port ?? project.config.port;
    const packageManager = await detectPackageManager(
      project.directory,
      manifest.packageManager,
    );
    const portalsDirectory = flags['portals-dir']
      ? path.resolve(flags['portals-dir'])
      : path.join(project.directory, 'app-dist');

    this.log(
      `Starting "${project.config.name}" at ${hubUrl({ ...project.config, host, port })}...\n`,
    );

    const exitCode = await runAttached(packageManager, ['run', 'dev'], {
      cwd: project.directory,
      // See `hub start`: templates differ in which variable they read, so both conventions are provided.
      env: {
        ...process.env,
        APP_DIST_DIR: portalsDirectory,
        APP_SERVER_HOST: host,
        APP_SERVER_PORT: String(port),
        HOST: host,
        PORT: String(port),
      },
    });

    if (exitCode !== 0) {
      this.exit(exitCode);
    }
  }
}
