import { spawn } from 'node:child_process';
import { open, readFile } from 'node:fs/promises';
import path from 'node:path';
import { Command, Flags } from '@oclif/core';
import {
  HUB_STATE_DIR,
  hubUrl,
  requireHubProject,
  writeHubConfig,
} from '../../lib/hub-project.ts';
import { detectPackageManager } from '../../lib/package-manager.ts';
import {
  readProcessRecord,
  writeProcessRecord,
} from '../../lib/process-store.ts';

export const HUB_LOG_FILE = 'hub.log';

export default class HubStart extends Command {
  static override summary = 'Start the hub.';
  static override description =
    "Runs the hub's start script in the background and records the process, so it keeps running after this command returns.";

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --port 3100',
    '<%= config.bin %> <%= command.id %> --foreground',
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
    foreground: Flags.boolean({
      default: false,
      description:
        'Run in this terminal instead of the background, printing output directly.',
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(HubStart);
    const project = await requireHubProject(flags.dir);
    const stateDirectory = path.join(project.directory, HUB_STATE_DIR);
    const existing = await readProcessRecord(stateDirectory);

    if (existing?.running) {
      this.error(
        [
          `"${project.config.name}" is already running (pid ${existing.pid}).`,
          `Stop it first with \`${this.config.bin} hub stop\`.`,
        ].join('\n'),
      );
    }

    const config = {
      ...project.config,
      ...(flags.host === undefined ? {} : { host: flags.host }),
      ...(flags.port === undefined ? {} : { port: flags.port }),
    };

    // Remember an explicit address so stop, status, and open agree with what is actually running.
    if (flags.host !== undefined || flags.port !== undefined) {
      await writeHubConfig(project.directory, config);
    }

    const manifest = JSON.parse(
      await readFile(path.join(project.directory, 'package.json'), 'utf8'),
    ) as {
      packageManager?: string;
      scripts?: Record<string, string>;
    };

    if (!manifest.scripts?.start) {
      this.error(
        [
          `"${project.config.name}" has no start script in its package.json.`,
          'Install dependencies and build it first, or check that the hub template is complete.',
        ].join('\n'),
      );
    }

    const packageManager = await detectPackageManager(
      project.directory,
      manifest.packageManager,
    );
    // Which variable a start script reads is up to the template: the NocoBase hub server reads APP_SERVER_*, while
    // Vite-based templates read PORT and HOST. Both are set so the address is honoured either way, and a template
    // that reads neither will simply use its own default.
    const environment = {
      ...process.env,
      APP_SERVER_HOST: config.host,
      APP_SERVER_PORT: String(config.port),
      HOST: config.host,
      PORT: String(config.port),
    };

    if (flags.foreground) {
      const { runAttached } = await import('../../lib/run-command.ts');

      this.log(`Starting "${project.config.name}" at ${hubUrl(config)}...\n`);
      const exitCode = await runAttached(packageManager, ['run', 'start'], {
        cwd: project.directory,
        env: environment,
      });

      if (exitCode !== 0) {
        this.exit(exitCode);
      }

      return;
    }

    const logPath = path.join(stateDirectory, 'logs', HUB_LOG_FILE);
    const logHandle = await open(logPath, 'a');

    try {
      // Detached with the terminal replaced by the log file, so the hub outlives this command and its output is
      // still readable through `hub logs`.
      const child = spawn(packageManager, ['run', 'start'], {
        cwd: project.directory,
        detached: true,
        env: environment,
        stdio: ['ignore', logHandle.fd, logHandle.fd],
      });

      child.unref();

      await writeProcessRecord(stateDirectory, {
        host: config.host,
        pid: child.pid as number,
        port: config.port,
        startedAt: new Date().toISOString(),
      });

      this.log(
        `Started "${project.config.name}" (pid ${child.pid}) at ${hubUrl(config)}.`,
      );
      this.log(`Logs: ${this.config.bin} hub logs --follow`);
    } finally {
      await logHandle.close();
    }
  }
}
