import { spawn } from 'node:child_process';

export interface RunCommandOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  /** Forward the child's output to this stream as it arrives, for commands a person should watch. */
  echo?: NodeJS.WritableStream;
}

export interface RunCommandResult {
  stdout: string;
  stderr: string;
}

export class CommandFailedError extends Error {
  public readonly command: string;
  public readonly exitCode: number | null;
  public readonly stdout: string;
  public readonly stderr: string;

  public constructor(
    command: string,
    exitCode: number | null,
    stdout: string,
    stderr: string,
    reason?: string,
  ) {
    super(
      reason ??
        `${command} failed${exitCode === null ? '' : ` with exit code ${exitCode}`}.`,
    );
    this.name = 'CommandFailedError';
    this.command = command;
    this.exitCode = exitCode;
    this.stdout = stdout;
    this.stderr = stderr;
  }
}

/** Runs a child process, collecting its output, and rejects with `CommandFailedError` on a non-zero exit. */
export function runCommand(
  command: string,
  args: readonly string[],
  options: RunCommandOptions = {},
): Promise<RunCommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timer: NodeJS.Timeout | undefined;
    const label = [command, ...args].join(' ');

    if (options.timeoutMs) {
      timer = setTimeout(() => {
        child.kill('SIGTERM');
        reject(
          new CommandFailedError(
            label,
            null,
            stdout,
            stderr,
            `${label} timed out after ${Math.round(options.timeoutMs! / 1000)}s.`,
          ),
        );
      }, options.timeoutMs);
      timer.unref();
    }

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
      options.echo?.write(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
      options.echo?.write(chunk);
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
      reject(new CommandFailedError(label, code, stdout, stderr));
    });
  });
}

/** The last `lines` lines of a command's output, for an error message that has to fit on a screen. */
export function tail(text: string, lines = 20): string {
  return text.trimEnd().split('\n').slice(-lines).join('\n');
}
