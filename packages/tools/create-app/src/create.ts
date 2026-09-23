import path from 'node:path';
import { formatHelp, parseInput, type ParsedInput } from './lib/flags.ts';
import {
  installDependencies,
  syncSkills,
  verifyDriver,
} from './lib/install.ts';
import { ensureAllowBuilds } from './lib/pnpm-workspace.ts';
import {
  cancel,
  intro,
  log,
  note,
  outro,
  promptAppName,
  PromptCancelledError,
} from './lib/prompts.ts';
import {
  assertTargetIsUsable,
  assertValidAppName,
  removeDirectory,
  scaffoldFromTemplate,
} from './lib/scaffold.ts';
import {
  DEFAULT_REGISTRY,
  downloadTemplate,
  resolveTemplateKind,
  resolveTemplateSource,
} from './lib/template.ts';
import { buildHubEnvFile, readEnvExample } from './lib/hub.ts';
import { buildNpmrcFile } from './lib/npmrc.ts';

export interface CreateAppOptions {
  argv: string[];
  version: string;
  binary: string;
}

interface CreateResult {
  status: 'success' | 'error';
  stage: 'input' | 'download' | 'scaffold' | 'install' | 'verify' | 'complete';
  directory?: string;
  projectCreated: boolean;
  dependenciesInstalled: boolean;
  configured: false;
  nextCommands?: string[];
  message?: string;
  warnings: string[];
}

/** One result on stdout in JSON mode; human progress uses stderr in that mode. */
function writeJson(result: unknown): void {
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

export async function createApp(options: CreateAppOptions): Promise<number> {
  let input: ParsedInput;
  const result: CreateResult = {
    status: 'error',
    stage: 'input',
    projectCreated: false,
    dependenciesInstalled: false,
    configured: false,
    warnings: [],
  };
  try {
    input = await parseInput(options.argv);
  } catch (error) {
    result.message = (error as Error).message;
    if (options.argv.includes('--json')) writeJson(result);
    else process.stderr.write(`${result.message}\n`);
    return 2;
  }
  if (input.flags.help || input.flags.version) {
    const value = input.flags.help
      ? formatHelp(options.binary)
      : options.version;
    if (input.flags.json)
      writeJson({
        status: 'success',
        [input.flags.help ? 'help' : 'version']: value,
      });
    else process.stdout.write(`${value}\n`);
    return 0;
  }
  const progress = (message: string): void => {
    if (input.flags.json) process.stderr.write(`${message}\n`);
    else log.info(message);
  };
  try {
    if (input.flags.json && !input.directory)
      throw new Error('DIRECTORY is required with --json.');
    if (!input.flags.json) intro('Create a NocoBase project');
    await run(input, result, progress);
    result.status = 'success';
    result.stage = 'complete';
    if (input.flags.json) writeJson(result);
    else {
      note(
        [
          `cd ${input.directory ?? path.basename(result.directory ?? '')}`,
          ...(result.nextCommands ?? []),
        ].join('\n'),
        'Next steps',
      );
      outro('Done.');
    }
    return 0;
  } catch (error) {
    result.message = (error as Error).message;
    if (result.stage === 'install') result.nextCommands = ['pnpm install'];
    if (input.flags.json) writeJson(result);
    else
      cancel(
        `${result.message}${result.projectCreated ? `\nProject files are in ${result.directory}.` : ''}${result.stage === 'install' ? '\nRun pnpm install inside the project to retry.' : ''}`,
      );
    return error instanceof PromptCancelledError
      ? 130
      : result.stage === 'input'
        ? 2
        : 1;
  }
}

async function run(
  input: ParsedInput,
  result: CreateResult,
  progress: (message: string) => void,
): Promise<void> {
  const name = input.directory ?? (await promptAppName());
  assertValidAppName(name);
  const targetDirectory = path.resolve(process.cwd(), name);
  result.directory = targetDirectory;
  result.stage = 'scaffold';
  await assertTargetIsUsable(targetDirectory);
  const registry =
    input.flags.registry ?? process.env.NOCOBASE_REGISTRY ?? DEFAULT_REGISTRY;
  const source = resolveTemplateSource(input.flags.template, {
    tag: input.flags['template-tag'],
  });
  result.stage = 'download';
  progress(`Downloading ${source}`);
  const template = await downloadTemplate({ registry, source });
  result.stage = 'scaffold';
  try {
    const kind = resolveTemplateKind(input.flags.template, {
      name: template.name,
      nocobase: { templateKind: template.kind },
    });
    const extraFiles: Record<string, string> = {
      '.npmrc': buildNpmrcFile({ registry }),
    };
    if (kind === 'hub')
      extraFiles['.env'] = buildHubEnvFile({
        example: await readEnvExample(template.directory),
        name,
      });
    await scaffoldFromTemplate({
      name,
      targetDirectory,
      templateDirectory: template.directory,
      extraFiles,
    });
    result.projectCreated = true;
    await ensureAllowBuilds(targetDirectory);
    // Creation stops at a project that can be configured, not at one that can run. Which database an application uses
    // is decided by the driver it depends on, and configuring it is `config:init`'s job — so the next steps name it
    // rather than this command writing a configuration nobody asked for.
    result.nextCommands =
      kind === 'hub'
        ? ['pnpm config:init', 'pnpm config:check', 'pnpm build', 'pnpm start']
        : ['pnpm config:init', 'pnpm config:check', 'pnpm dev'];
    result.message =
      'Configure the application with pnpm config:init before starting it. That uses SQLite; for another database, install its driver and name the dialect, for example: pnpm add @nocobase/db-postgres, then pnpm config:init --dialect postgres';
    progress(`Created ${name}. ${result.message}`);
  } finally {
    await removeDirectory(template.directory);
  }
  if (!input.flags.install) {
    result.nextCommands?.unshift('pnpm install');
    return;
  }
  result.stage = 'install';
  progress('Installing dependencies with pnpm');
  await installDependencies({
    directory: targetDirectory,
    registry,
    onOutput: (chunk) => {
      process.stderr.write(chunk);
    },
  });
  result.dependenciesInstalled = true;
  result.stage = 'verify';
  const verification = await verifyDriver(targetDirectory);
  if (verification.rebuilt)
    progress('Compiled the native addon for the database driver.');
  if (!verification.ok)
    throw new Error(
      verification.reason ?? 'Database driver verification failed.',
    );
  progress('Synchronizing NocoBase package skills');
  const synchronized = await syncSkills(targetDirectory);
  if (!synchronized.ok) {
    const warning =
      synchronized.reason ?? 'Could not synchronize NocoBase package skills.';
    result.warnings.push(warning);
    progress(warning);
  }
}
