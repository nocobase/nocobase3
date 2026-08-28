import path from 'node:path';
import { formatHelp, parseInput, type ParsedInput } from './lib/flags.ts';
import { installDependencies, verifySqliteDriver } from './lib/install.ts';
import {
  cancel,
  intro,
  log,
  note,
  outro,
  promptDirectory,
  PromptCancelledError,
  spinner,
} from './lib/prompts.ts';
import {
  assertTargetIsUsable,
  projectNameFromDirectory,
  removeDirectory,
  scaffoldHub,
} from './lib/scaffold.ts';
import {
  DEFAULT_REGISTRY,
  downloadTemplate,
  type ResolvedTemplate,
} from './lib/template.ts';

export interface CreateHubOptions {
  argv: string[];
  version: string;
  binary: string;
}

export async function createHub(options: CreateHubOptions): Promise<number> {
  let input: ParsedInput;
  try {
    input = await parseInput(options.argv);
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    return 2;
  }

  if (input.flags.help) {
    process.stdout.write(`${formatHelp(options.binary)}\n`);
    return 0;
  }
  if (input.flags.version) {
    process.stdout.write(`${options.version}\n`);
    return 0;
  }

  try {
    return await run(input);
  } catch (error) {
    if (error instanceof PromptCancelledError) {
      cancel('Cancelled.');
      return 130;
    }
    cancel((error as Error).message);
    return 1;
  }
}

async function run(input: ParsedInput): Promise<number> {
  intro('Create a NocoBase Hub');

  const requestedDirectory = input.directory ?? (await promptDirectory());
  const targetDirectory = path.resolve(process.cwd(), requestedDirectory);
  await assertTargetIsUsable(targetDirectory);

  const registry =
    input.flags.registry ?? process.env.NOCOBASE_REGISTRY ?? DEFAULT_REGISTRY;
  const downloadProgress = spinner();
  downloadProgress.start(`Downloading ${input.flags.template}`);

  let template: ResolvedTemplate;
  try {
    template = await downloadTemplate({
      registry,
      source: input.flags.template,
    });
    downloadProgress.stop(`Downloaded ${template.name}@${template.version}`);
  } catch (error) {
    downloadProgress.stop('Could not download the Hub package.');
    throw error;
  }

  try {
    await scaffoldHub({
      name: projectNameFromDirectory(targetDirectory),
      targetDirectory,
      templateDirectory: template.directory,
    });
  } catch (error) {
    await removeDirectory(targetDirectory);
    throw error;
  } finally {
    await removeDirectory(template.directory);
  }

  log.success(
    `Created Hub from ${template.name}@${template.version} in ${displayPath(targetDirectory)}.`,
  );

  if (!input.flags.install) {
    finish(targetDirectory, false);
    return 0;
  }

  const installProgress = spinner();
  installProgress.start('Installing dependencies with pnpm');
  try {
    await installDependencies(targetDirectory, registry);
    installProgress.stop('Installed dependencies.');
  } catch (error) {
    installProgress.stop('Installing dependencies failed.');
    log.warn((error as Error).message);
    finish(targetDirectory, false, 'Created with dependency install errors.');
    return 1;
  }

  const verification = await verifySqliteDriver(targetDirectory);
  if (verification.rebuilt) {
    log.info('Compiled the native addon for better-sqlite3.');
  } else if (!verification.ok && verification.reason) {
    log.warn(verification.reason);
    finish(targetDirectory, true, 'Created with SQLite verification errors.');
    return 1;
  }

  finish(targetDirectory, true);
  return 0;
}

function displayPath(directory: string): string {
  return path.relative(process.cwd(), directory) || '.';
}

function finish(
  directory: string,
  installed: boolean,
  message = 'Done.',
): void {
  const relative = displayPath(directory);
  const steps = [`cd ${relative}`];
  if (!installed) steps.push('pnpm install');
  steps.push('pnpm start');

  note(steps.join('\n'), 'Next steps');
  log.info('Hub will be available at http://127.0.0.1:13000/hub/.');
  log.info('Edit .env.local before starting Hub on another host or port.');
  outro(message);
}
