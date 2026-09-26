import { CommandFailedError, runCommand } from './run-command.ts';

export interface Pm2Process {
  name: string;
  pid: number;
  status: string;
  restarts: number;
}

/** pm2 prints daemon notices such as "[PM2] Spawning PM2 daemon" before the JSON; the array is the last line that parses. */
export function parseJlist(stdout: string): Pm2Process[] {
  const lines = stdout.trim().split('\n').reverse();
  for (const line of lines) {
    if (!line.startsWith('[')) continue;
    try {
      const parsed = JSON.parse(line) as {
        name: string;
        pid: number;
        pm2_env?: { status?: string; restart_time?: number };
      }[];
      return parsed.map((entry) => ({
        name: entry.name,
        pid: entry.pid,
        status: entry.pm2_env?.status ?? 'unknown',
        restarts: entry.pm2_env?.restart_time ?? 0,
      }));
    } catch {
      // A notice line that happens to start with "[".
    }
  }
  return [];
}

export interface Pm2 {
  version(): Promise<string>;
  start(ecosystemFile: string, cwd: string): Promise<void>;
  stop(name: string): Promise<void>;
  /** Removes the process entry; a name pm2 does not know is not an error. */
  remove(name: string): Promise<void>;
  save(): Promise<void>;
  describe(name: string): Promise<Pm2Process | undefined>;
}

export function createPm2(bin = 'pm2'): Pm2 {
  return {
    async version() {
      const { stdout } = await runCommand(bin, ['--version']);
      return stdout.trim().split('\n').pop() ?? '';
    },
    async start(ecosystemFile, cwd) {
      await runCommand(bin, ['start', ecosystemFile], { cwd });
    },
    async stop(name) {
      await runCommand(bin, ['stop', name]);
    },
    async remove(name) {
      try {
        await runCommand(bin, ['delete', name]);
      } catch (error) {
        if (
          error instanceof CommandFailedError &&
          /not found/iu.test(`${error.stdout}\n${error.stderr}`)
        ) {
          return;
        }
        throw error;
      }
    },
    async save() {
      await runCommand(bin, ['save']);
    },
    async describe(name) {
      const { stdout } = await runCommand(bin, ['jlist']);
      return parseJlist(stdout).find((entry) => entry.name === name);
    },
  };
}
