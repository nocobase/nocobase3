export interface CreatePluginFlags {
  readonly description?: string;
  readonly displayName?: string;
  readonly dryRun: boolean;
  readonly help: boolean;
  readonly install: boolean;
  readonly version: boolean;
}

export interface ParsedCreatePluginInput {
  readonly flags: CreatePluginFlags;
  readonly name?: string;
}

export function parseCreatePluginArgs(
  args: readonly string[],
): ParsedCreatePluginInput {
  let description: string | undefined;
  let displayName: string | undefined;
  let dryRun = false;
  let help = false;
  let install = true;
  let version = false;
  const positionals: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];

    if (argument === '--help' || argument === '-h') {
      help = true;
      continue;
    }
    if (argument === '--version') {
      version = true;
      continue;
    }
    if (argument === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (argument === '--no-install') {
      install = false;
      continue;
    }
    if (argument === '--display-name' || argument === '--description') {
      const value = args[index + 1];
      if (value === undefined || value.startsWith('-')) {
        throw new Error(`${argument} requires a value.`);
      }
      if (argument === '--display-name') {
        displayName = value;
      } else {
        description = value;
      }
      index += 1;
      continue;
    }
    if (argument.startsWith('-')) {
      throw new Error(`Unknown option: ${argument}`);
    }

    positionals.push(argument);
  }

  if (positionals.length > 1) {
    throw new Error('Expected exactly one plugin name.');
  }
  if (!help && !version && positionals[0] === undefined) {
    throw new Error('A plugin name is required.');
  }

  return {
    flags: { description, displayName, dryRun, help, install, version },
    name: positionals[0],
  };
}

export function formatHelp(binary: string): string {
  return [
    'Create a NocoBase application plugin in packages/.',
    '',
    'USAGE',
    `  ${binary} <name> [options]`,
    '',
    'ARGUMENTS',
    '  <name>                       Short kebab-case name, for example audit-log',
    '                               (full @nocobase/app-plugin-* names also work)',
    '',
    'OPTIONS',
    '  --display-name <name>        Human-readable package display name',
    '  --description <description>  Package description',
    '  --no-install                 Do not synchronize pnpm-lock.yaml',
    '  --dry-run                    Validate and print the target without writing',
    '  --version                    Show the version',
    '  -h, --help                   Show this help',
    '',
    'The generated plugin uses @nocobase/dev-config, has no src/ directory,',
    'and includes database, server, client contribution entries, and matching',
    'tests. Registering or enabling the plugin remains an explicit step.',
  ].join('\n');
}
