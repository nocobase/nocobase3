import { Args, Flags, type Interfaces } from '@oclif/core';
import { parse } from '@oclif/core/parser';
import { DATABASE_DIALECTS } from './database.ts';
import {
  DEFAULT_TEMPLATE,
  DEFAULT_TEMPLATE_TAG,
  TEMPLATE_ALIASES,
  TEMPLATE_TAGS,
} from './template.ts';

/**
 * `pnpm create @nocobase/app crm --db-dialect=postgres` passes every argument after the package name through verbatim,
 * so this parses the same argv shape a direct `npx @nocobase/create-app` invocation would produce.
 */
export interface CreateArgumentOutput {
  directory: string | undefined;
}

export interface CreateFlagOutput {
  'db-dialect': string | undefined;
  install: boolean | undefined;
  template: string;
  'template-tag': string;
  registry: string | undefined;
  help: boolean | undefined;
  version: boolean | undefined;
}

export const CREATE_ARGS: Interfaces.ArgInput<CreateArgumentOutput> = {
  directory: Args.string({
    description:
      'Directory to create the app in, relative to the current directory. Prompted for when omitted.',
    required: false,
  }),
};

export const CREATE_FLAGS: Interfaces.FlagInput<CreateFlagOutput> = {
  'db-dialect': Flags.string({
    description: `Database type: ${DATABASE_DIALECTS.join(', ')}. Aliases such as postgresql, pg, and sqlite3 are accepted. Prompted for when omitted.`,
  }),
  install: Flags.boolean({
    allowNo: true,
    default: true,
    description: 'Install dependencies after scaffolding.',
  }),
  template: Flags.string({
    default: DEFAULT_TEMPLATE,
    description: `Template to scaffold from: a name (${Object.keys(TEMPLATE_ALIASES).join(', ')}), a published package, or a path to a local package directory.`,
  }),
  'template-tag': Flags.string({
    default: DEFAULT_TEMPLATE_TAG,
    options: [...TEMPLATE_TAGS],
    description: `Channel to fetch a named template from: ${TEMPLATE_TAGS.join(', ')}. Ignored when --template names a package or a path, which already say which version to use.`,
  }),
  registry: Flags.string({
    description: 'npm registry to download the template from.',
  }),
  help: Flags.boolean({
    char: 'h',
    default: false,
    description: 'Show this help.',
  }),
  version: Flags.boolean({
    default: false,
    description: 'Show the version.',
  }),
};

export interface ParsedInput {
  directory?: string;
  flags: {
    'db-dialect'?: string;
    install: boolean;
    template: string;
    'template-tag': string;
    registry?: string;
    help: boolean;
    version: boolean;
  };
}

export async function parseInput(argv: string[]): Promise<ParsedInput> {
  const parsed = await parse(argv, {
    args: CREATE_ARGS,
    flags: CREATE_FLAGS,
    strict: true,
  });

  return {
    directory: parsed.args.directory,
    flags: parsed.flags as ParsedInput['flags'],
  };
}

export function formatHelp(binary: string): string {
  return [
    'Create a NocoBase 3 application.',
    '',
    'USAGE',
    `  $ ${binary} [DIRECTORY] [FLAGS]`,
    '',
    'ARGUMENTS',
    '  DIRECTORY  Directory to create the app in. Prompted for when omitted.',
    '',
    'FLAGS',
    ...Object.entries(CREATE_FLAGS).map(([name, flag]) => {
      const label =
        'allowNo' in flag && flag.allowNo ? `--[no-]${name}` : `--${name}`;
      return `  ${label.padEnd(18)} ${flag.description ?? ''}`;
    }),
    '',
    'EXAMPLES',
    `  $ ${binary} crm`,
    `  $ ${binary} crm --db-dialect=postgres`,
    `  $ ${binary} crm --db-dialect=sqlite --no-install`,
    `  $ ${binary} crm --template-tag=beta`,
    '',
    'NOTES',
    '  The template is downloaded from https://npm.nocobase.ai by default.',
    '  Override it with --registry, or set the NOCOBASE_REGISTRY environment variable.',
    '',
    '  Database connection settings are written to .env.local with defaults.',
    '  For postgres and mysql, edit that file before starting the app.',
  ].join('\n');
}
