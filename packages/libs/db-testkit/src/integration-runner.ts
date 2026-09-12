import { spawn, type ChildProcess } from 'node:child_process';

export interface DatabaseIntegrationRunnerOptions {
  readonly name: string;
  readonly composeFile: string;
  readonly service: string;
  readonly containerPort: number;
  readonly hostEnvironmentVariable: string;
  readonly portEnvironmentVariable: string;
  readonly initServices?: readonly string[];
  readonly testArguments?: readonly string[];
  readonly testEnvironment?: Readonly<Record<string, string>>;
}

interface RunResult {
  readonly code: number;
  readonly signal: NodeJS.Signals | null;
}

/**
 * Runs one dialect's integration suite in a disposable, isolated Compose
 * project. Dialect packages only provide service-specific configuration.
 */
export async function runDatabaseIntegration(
  options: DatabaseIntegrationRunnerOptions,
): Promise<number> {
  const projectName = createProjectName(options.name);
  const keepEnvironment = process.env.KEEP_TEST_DB === '1';
  let activeProcess: ChildProcess | undefined;
  let receivedSignal: NodeJS.Signals | undefined;

  const run = async (
    command: string,
    args: readonly string[],
    environment: NodeJS.ProcessEnv = process.env,
    captureOutput = false,
    allowFailure = false,
  ): Promise<{ result: RunResult; output: string }> => {
    const promise = runProcess(command, args, environment, captureOutput);
    activeProcess = promise.process;
    const result = await promise.result;
    activeProcess = undefined;
    if (!allowFailure && (result.code !== 0 || result.signal)) {
      throw new Error(
        `${command} ${args.join(' ')} exited with ${formatExit(result)}`,
      );
    }
    return { result, output: await promise.output };
  };

  const compose = (
    args: readonly string[],
    captureOutput = false,
    allowFailure = false,
  ) =>
    run(
      'docker',
      [
        'compose',
        '--project-name',
        projectName,
        '--file',
        options.composeFile,
        ...args,
      ],
      process.env,
      captureOutput,
      allowFailure,
    );

  const handleSignal = (signal: NodeJS.Signals): void => {
    receivedSignal = signal;
    activeProcess?.kill(signal);
  };

  process.on('SIGINT', handleSignal);
  process.on('SIGTERM', handleSignal);

  const cleanup = async (): Promise<void> => {
    if (keepEnvironment) {
      console.error(
        `[db-testkit] Keeping ${projectName} because KEEP_TEST_DB=1.`,
      );
      return;
    }
    await compose(['down', '--volumes', '--remove-orphans'], false, true);
  };

  try {
    await compose(['down', '--volumes', '--remove-orphans'], false, true);
    await compose(['up', '--detach', '--wait', options.service]);

    for (const initService of options.initServices ?? [])
      await compose(['run', '--rm', initService]);

    const portResult = await compose(
      ['port', options.service, String(options.containerPort)],
      true,
    );
    const port = parsePublishedPort(portResult.output);
    const testEnvironment: NodeJS.ProcessEnv = {
      ...process.env,
      ...options.testEnvironment,
      [options.hostEnvironmentVariable]: '127.0.0.1',
      [options.portEnvironmentVariable]: String(port),
    };
    const testResult = await run(
      'pnpm',
      [
        'exec',
        'vitest',
        'run',
        'tests/integration',
        ...(options.testArguments ?? []),
      ],
      testEnvironment,
      false,
      true,
    );
    if (receivedSignal) return 128 + signalExitCode(receivedSignal);
    return testResult.result.code;
  } catch (error) {
    if (receivedSignal) return 128 + signalExitCode(receivedSignal);
    console.error(error instanceof Error ? error.message : error);
    return 1;
  } finally {
    process.off('SIGINT', handleSignal);
    process.off('SIGTERM', handleSignal);
    try {
      await cleanup();
    } catch (error) {
      console.error(
        `[db-testkit] Failed to clean up ${projectName}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }
}

function runProcess(
  command: string,
  args: readonly string[],
  environment: NodeJS.ProcessEnv,
  captureOutput: boolean,
): {
  process: ChildProcess;
  result: Promise<RunResult>;
  output: Promise<string>;
} {
  const child = spawn(command, args, {
    stdio: captureOutput ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    env: environment,
  });
  let output = '';
  if (child.stdout)
    child.stdout.on('data', (chunk: Buffer | string) => {
      output += String(chunk);
    });
  const result = new Promise<RunResult>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => {
      resolve({ code: code ?? 1, signal });
    });
  });
  return {
    process: child,
    result,
    output: Promise.resolve().then(async () => {
      await result;
      return output;
    }),
  };
}

function createProjectName(name: string): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `nocobase-${name}-${process.pid}-${random}`.replace(
    /[^a-z0-9_-]/gi,
    '-',
  );
}

function parsePublishedPort(output: string): number {
  const match = output.trim().match(/:(\d+)\s*$/m);
  if (!match)
    throw new Error(`Could not determine the published port: ${output}`);
  return Number(match[1]);
}

function formatExit(result: RunResult): string {
  return result.signal ? `signal ${result.signal}` : `code ${result.code}`;
}

function signalExitCode(signal: NodeJS.Signals): number {
  if (signal === 'SIGINT') return 2;
  if (signal === 'SIGTERM') return 15;
  return 1;
}
