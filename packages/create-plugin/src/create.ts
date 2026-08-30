import { formatHelp, parseCreatePluginArgs } from './lib/flags.ts';
import { createPlugin } from './lib/scaffold.ts';

export { parseCreatePluginArgs } from './lib/flags.ts';
export { createPlugin } from './lib/scaffold.ts';
export { normalizePluginName } from './lib/names.ts';
export {
  normalizePluginCapabilities,
  PLUGIN_CAPABILITIES,
  type PluginCapabilities,
  type PluginCapability,
} from './lib/capabilities.ts';

export interface RunCreatePluginCliOptions {
  readonly argv: readonly string[];
  readonly binary: string;
  readonly repoRoot?: string;
  readonly version: string;
}

interface JsonCliError {
  readonly code: string;
  readonly message: string;
  readonly suggestions: readonly string[];
}

function classifyCreatePluginError(error: unknown): JsonCliError {
  const message = error instanceof Error ? error.message : String(error);
  if (message.startsWith('No plugin capabilities were selected.')) {
    return {
      code: 'NO_CAPABILITIES_SELECTED',
      message,
      suggestions: [
        'Add --with <capability>.',
        'Use --empty to create only the package foundation.',
      ],
    };
  }
  if (message.startsWith('Unknown plugin capability:')) {
    return {
      code: 'UNKNOWN_CAPABILITY',
      message,
      suggestions: ['Select a capability listed by --help.'],
    };
  }
  if (message === '--with requires a capability value.') {
    return {
      code: 'MISSING_CAPABILITY_VALUE',
      message,
      suggestions: ['Add a supported capability after --with.'],
    };
  }
  if (message === '--empty cannot be combined with --with.') {
    return {
      code: 'CONFLICTING_CAPABILITY_SELECTION',
      message,
      suggestions: ['Use either --empty or one or more --with options.'],
    };
  }
  if (message.startsWith('Target already exists:')) {
    return {
      code: 'TARGET_ALREADY_EXISTS',
      message,
      suggestions: [
        'Choose another plugin name or inspect the existing package.',
      ],
    };
  }
  return {
    code: 'CREATE_PLUGIN_FAILED',
    message,
    suggestions: ['Run plugin:create --help and correct the request.'],
  };
}

function capabilityReason(file: string): string {
  if (file.startsWith('database/')) return 'database';
  if (file.startsWith('server/locales/')) return 'server.locales';
  if (
    file.startsWith('server/providers/') ||
    file.startsWith('server/services/') ||
    file === 'server/tokens.ts' ||
    file === 'tests/server-provider.test.ts'
  )
    return 'server.providers';
  if (file.startsWith('server/routes/') || file === 'tests/routes.test.ts')
    return 'server.routes';
  if (file.startsWith('server/jobs/') || file === 'tests/jobs.test.ts')
    return 'server.jobs';
  if (file.startsWith('client/locales/')) return 'client.locales';
  if (file === 'client/routes.ts' || file === 'tests/client.test.ts')
    return 'client.routes';
  if (
    file === 'client/components/plugin-component.tsx' ||
    file === 'tests/component.test.tsx'
  )
    return 'client.components';
  if (
    file === 'client/providers.ts' ||
    file === 'client/contexts.ts' ||
    file === 'client/components/provider.tsx' ||
    file === 'tests/client-provider.test.tsx'
  )
    return 'client.providers';
  if (file === 'client/bootstrap.ts' || file === 'tests/bootstrap.test.ts')
    return 'client.bootstrap';
  if (
    file.startsWith('registry/') ||
    file === 'registry.config.json' ||
    file === 'components.json' ||
    file === 'client/styles.css'
  )
    return 'registry';
  if (file.startsWith('skills/')) return 'skills';
  if (file === 'client/index.ts' || file === 'client/plugin.ts')
    return 'derived-client-plugin';
  if (
    file === 'server/index.ts' ||
    file === 'server/plugin.ts' ||
    file === 'tests/plugin.test.ts'
  )
    return 'derived-server-plugin';
  return 'package-foundation';
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
      empty: input.flags.empty,
      install: input.flags.install,
      capabilities: input.flags.capabilities,
      name: input.name!,
      repoRoot: options.repoRoot,
    });
    if (input.flags.json) {
      process.stdout.write(
        `${JSON.stringify(
          {
            schemaVersion: 1,
            ok: true,
            operation: 'plugin:create',
            mode: input.flags.dryRun ? 'dry-run' : 'create',
            plugin: {
              shortName: result.shortName,
              packageName: result.packageName,
              targetDirectory: result.targetDirectory,
            },
            requestedCapabilities: input.flags.capabilities,
            capabilities: result.capabilities,
            derivedStructure: {
              clientPlugin:
                result.capabilities.client.bootstrap ||
                result.capabilities.client.locales ||
                result.capabilities.client.providers ||
                result.capabilities.client.routes,
              serverPlugin:
                result.capabilities.database ||
                result.capabilities.server.jobs ||
                result.capabilities.server.locales ||
                result.capabilities.server.providers ||
                result.capabilities.server.routes,
            },
            files: result.files.map((file) => ({
              path: file,
              reason: capabilityReason(file),
            })),
            writes: input.flags.dryRun ? [] : result.files,
            commands:
              input.flags.dryRun || !input.flags.install
                ? []
                : ['CI=true pnpm install --no-frozen-lockfile'],
            nextSteps: [
              `pnpm --filter ${result.packageName} check`,
              `pnpm plugin:register ${result.shortName} --app app-template-default`,
            ],
          },
          null,
          2,
        )}\n`,
      );
      return 0;
    }
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
    if (options.argv.includes('--json')) {
      process.stderr.write(
        `${JSON.stringify(
          {
            schemaVersion: 1,
            ok: false,
            operation: 'plugin:create',
            error: classifyCreatePluginError(error),
          },
          null,
          2,
        )}\n`,
      );
      return 1;
    }
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.stderr.write(`Run ${options.binary} --help for usage.\n`);
    return 1;
  }
}
