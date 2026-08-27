import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_APP,
  formatSkillsSyncSummary,
  syncSkills,
} from './lib/skills-sync.mjs';

const scriptPath = fileURLToPath(import.meta.url);

const help = `Synchronize plugin skills into an application.

Plugins ship skills in <plugin>/.agents/skills/<skill-name>/ and this command copies them into
<app>/.agents/skills/<skill-name>/. Upstream is the single source of truth: every synchronized directory is replaced
wholesale, and directories that do not start with nocobase- are never touched.

Usage:
  pnpm plugin:skills:sync [options]

Options:
  --app <app>       Application directory or package name
                    (default: ${DEFAULT_APP})
  --plugin <name>   Only synchronize this plugin
                    (default: every plugin registered by the application)
  --dry-run         Print what would be copied and removed without writing
  -h, --help        Show this help

Examples:
  pnpm plugin:skills:sync
  pnpm plugin:skills:sync --app @nocobase/app-template-default
  pnpm plugin:skills:sync --plugin authorization
  pnpm plugin:skills:sync --dry-run`;

export function parseSyncSkillsArgs(args) {
  const options = {
    app: DEFAULT_APP,
    dryRun: false,
    help: false,
    plugin: undefined,
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];

    if (argument === '--help' || argument === '-h') {
      options.help = true;
      continue;
    }
    if (argument === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (argument === '--app' || argument === '--plugin') {
      const value = args[index + 1];
      if (value === undefined || value.startsWith('-')) {
        throw new Error(`${argument} requires a value.`);
      }
      options[argument === '--app' ? 'app' : 'plugin'] = value;
      index += 1;
      continue;
    }
    if (argument.startsWith('-')) {
      throw new Error(`Unknown option: ${argument}`);
    }
    throw new Error(
      `Unexpected argument: ${argument}. Use --plugin <name> to limit the synchronization.`,
    );
  }

  return options;
}

async function main() {
  try {
    const options = parseSyncSkillsArgs(process.argv.slice(2));
    if (options.help) {
      console.log(help);
      return;
    }

    const result = await syncSkills(options);
    console.log(formatSkillsSyncSummary(result));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    console.error('Run pnpm plugin:skills:sync --help for usage.');
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] && path.resolve(process.argv[1]);
if (invokedPath === scriptPath) {
  await main();
}
