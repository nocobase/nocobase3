import { createRequire } from 'node:module';
import path from 'node:path';
import { runInheritedCommand } from './run-command.ts';

const require = createRequire(import.meta.url);

export interface PullHubSourceOptions {
  readonly app: string;
  /** Internal test seam. Production callers always resolve the executable shipped by the CLI dependency. */
  readonly appExecutable?: string;
  readonly hub: string;
  readonly targetDirectory: string;
}

/** Pulls one Hub-managed source snapshot into an empty application directory. */
export async function pullHubSource(
  options: PullHubSourceOptions,
): Promise<void> {
  const executable = options.appExecutable ?? resolveAppExecutable();
  await runInheritedCommand(process.execPath, [
    executable,
    'pull',
    '--initialize',
    '--dir',
    path.resolve(options.targetDirectory),
    '--hub',
    options.hub,
    '--app',
    options.app,
    '--non-interactive',
  ]);
}

function resolveAppExecutable(): string {
  const manifest = require.resolve('@nocobase/nb3-cli/package.json');
  return path.join(path.dirname(manifest), 'bin', 'app.js');
}
