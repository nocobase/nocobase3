import { Args, Flags } from '@oclif/core';
import { parse } from '@oclif/core/parser';
import { DEFAULT_HUB_TEMPLATE, DEFAULT_REGISTRY } from './template.ts';

export const CREATE_ARGS = {
  directory: Args.string({
    description:
      'Directory to create the Hub in, relative to the current directory. Prompted for when omitted.',
    required: false,
  }),
};

export const CREATE_FLAGS = {
  install: Flags.boolean({
    allowNo: true,
    default: true,
    description: 'Install dependencies after scaffolding.',
  }),
  template: Flags.string({
    default: DEFAULT_HUB_TEMPLATE,
    description:
      'Hub package to scaffold from: a published package or a local package directory.',
  }),
  registry: Flags.string({
    description:
      'npm registry used to download the Hub package and dependencies.',
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
    install: boolean;
    template: string;
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
    'Create a standalone NocoBase Hub.',
    '',
    'USAGE',
    `  $ ${binary} [DIRECTORY] [FLAGS]`,
    '',
    'ARGUMENTS',
    '  DIRECTORY  Directory to create the Hub in. Prompted for when omitted.',
    '',
    'FLAGS',
    ...Object.entries(CREATE_FLAGS).map(([name, flag]) => {
      const label =
        'allowNo' in flag && flag.allowNo ? `--[no-]${name}` : `--${name}`;
      return `  ${label.padEnd(18)} ${flag.description ?? ''}`;
    }),
    '',
    'EXAMPLES',
    `  $ ${binary} my-hub`,
    `  $ ${binary} my-hub --no-install`,
    `  $ ${binary} my-hub --template=./packages/hub/dist`,
    '',
    'NOTES',
    `  The Hub package and its dependencies are downloaded from ${DEFAULT_REGISTRY} by default.`,
    '  Override it with --registry, or set the NOCOBASE_REGISTRY environment variable.',
  ].join('\n');
}
