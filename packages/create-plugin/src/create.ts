import { formatHelp, parseCreatePluginArgs } from './lib/flags.ts';
import { createPlugin } from './lib/scaffold.ts';

export { parseCreatePluginArgs } from './lib/flags.ts';
export { createPlugin } from './lib/scaffold.ts';
export { normalizePluginName } from './lib/names.ts';

export interface RunCreatePluginCliOptions {
  readonly argv: readonly string[];
  readonly binary: string;
  readonly repoRoot?: string;
  readonly version: string;
}

export async function runCreatePluginCli(
  options: RunCreatePluginCliOptions,
): Promise<number> {
  try {
    const input = parseCreatePluginArgs(options.argv);
    if (input.flags.help) {
      process.stdout.write(`${formatHelp(options.binary)}\n`);
      return 0;
    }
    if (input.flags.version) {
      process.stdout.write(`${options.version}\n`);
      return 0;
    }

    const result = await createPlugin({
      description: input.flags.description,
      displayName: input.flags.displayName,
      dryRun: input.flags.dryRun,
      install: input.flags.install,
      name: input.name!,
      repoRoot: options.repoRoot,
    });
    if (input.flags.dryRun) {
      process.stdout.write(
        `Would create ${result.packageName} at ${result.targetDirectory}\n`,
      );
      for (const file of result.files) {
        process.stdout.write(`  ${file}\n`);
      }
      return 0;
    }

    process.stdout.write(
      `Created ${result.packageName} at ${result.targetDirectory}\n`,
    );
    if (!input.flags.install) {
      process.stdout.write(
        'Skipped dependency installation. Run CI=true pnpm install --no-frozen-lockfile before committing.\n',
      );
    }
    process.stdout.write(
      `Next: register ${result.packageName} in the target application's package.json.\n`,
    );
    return 0;
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.stderr.write(`Run ${options.binary} --help for usage.\n`);
    return 1;
  }
}
