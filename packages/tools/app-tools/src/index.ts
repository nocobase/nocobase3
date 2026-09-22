import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const TOOL_ENTRIES = {
  dev: 'dev/index',
  build: 'build',
  start: 'start',
  retarget: 'utils/retarget-native',
  verify: 'utils/verify-server-deps',
} as const;
export type AppTool = keyof typeof TOOL_ENTRIES;
export interface RunAppToolOptions {
  readonly rootDir: string;
  readonly args?: readonly string[];
}
export function runAppTool(
  tool: AppTool,
  options: RunAppToolOptions,
): Promise<number> {
  const rootDir = path.resolve(options.rootDir);
  const entry = fileURLToPath(
    new URL(`./scripts/${TOOL_ENTRIES[tool]}.mjs`, import.meta.url),
  );
  if (tool === 'dev') {
    return import('./scripts/dev/supervisor.mjs').then(
      ({ superviseDevelopment }) =>
        superviseDevelopment({
          rootDir,
          entry,
          baseEnv: { ...process.env, NOCOBASE_TOOL_ROOT: rootDir },
        }),
    );
  }
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [...process.execArgv, entry, ...(options.args ?? process.argv.slice(2))],
      {
        cwd: rootDir,
        env: { ...process.env, NOCOBASE_TOOL_ROOT: rootDir },
        stdio: 'inherit',
      },
    );
    const stop = (): void => {
      child.kill('SIGTERM');
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    const cleanup = (): void => {
      process.off('SIGINT', stop);
      process.off('SIGTERM', stop);
    };
    child.once('error', (error) => {
      cleanup();
      reject(error);
    });
    child.once('close', (code, signal) => {
      cleanup();
      resolve(code ?? (signal === 'SIGINT' || signal === 'SIGTERM' ? 0 : 1));
    });
  });
}
