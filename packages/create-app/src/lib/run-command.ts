import { spawn } from 'node:child_process';

export interface RunCommandOptions {
  cwd?: string;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
}

export interface RunCommandResult {
  stdout: string;
  stderr: string;
}

export class CommandFailedError extends Error {
  public readonly command: string;
  public readonly exitCode: number | null;
  public readonly stderr: string;

  public constructor(command: string, exitCode: number | null, stderr: string) {
    super(
      `${command} failed${exitCode === null ? '' : ` with exit code ${exitCode}`}.`,
    );
    this.name = 'CommandFailedError';
    this.command = command;
    this.exitCode = exitCode;
    this.stderr = stderr;
  }
}

/**
 * Runs a child process and collects its output. `npm` and `pnpm` resolve through the shell on Windows, where they are
 * `.cmd` shims rather than executables, so the command name is passed to a shell there instead of being executed
 * directly.
 */
export function runCommand(
  command: string,
  args: string[],
  options: RunCommandOptions = {},
): Promise<RunCommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timer: NodeJS.Timeout | undefined;

    if (options.timeoutMs) {
      timer = setTimeout(() => {
        child.kill('SIGTERM');
        reject(
          new CommandFailedError(
            command,
            null,
            `Timed out after ${options.timeoutMs}ms.`,
          ),
        );
      }, options.timeoutMs);
      timer.unref();
    }

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.once('error', (error: Error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.once('close', (code: number | null) => {
      clearTimeout(timer);

      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(new CommandFailedError(command, code, stderr.trim()));
    });
  });
}

/**
 * Runs an interactive child command without buffering its output.
 *
 * Hub Device Authorization must print its approval URL while the child is still polling, so this path deliberately
 * inherits all standard streams instead of using `runCommand`, whose captured output is only available after exit.
 */
export function runInheritedCommand(
  command: string,
  args: string[],
  options: Omit<RunCommandOptions, 'timeoutMs'> = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      stdio: 'inherit',
    });

    child.once('error', reject);
    child.once('close', (code: number | null) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new CommandFailedError(command, code, ''));
    });
  });
}
