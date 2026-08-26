import path from 'node:path';
import {
  defaultDatabaseConfig,
  driverFor,
  driverNeedsBuild,
  needsConnectionDetails,
  parseDialect,
  type DatabaseDialect,
} from './lib/database.ts';
import { buildEnvFile } from './lib/env-file.ts';
import { formatHelp, parseInput, type ParsedInput } from './lib/flags.ts';
import { installDependencies, verifyDriver } from './lib/install.ts';
import { addDriverDependency } from './lib/manifest.ts';
import { ensureAllowBuilds } from './lib/pnpm-workspace.ts';
import {
  cancel,
  intro,
  log,
  note,
  outro,
  promptAppName,
  promptDialect,
  PromptCancelledError,
  spinner,
} from './lib/prompts.ts';
import {
  assertTargetIsUsable,
  assertValidAppName,
  readEnvExample,
  removeDirectory,
  scaffoldFromTemplate,
} from './lib/scaffold.ts';
import {
  DEFAULT_REGISTRY,
  DEFAULT_TEMPLATE,
  downloadTemplate,
} from './lib/template.ts';

export interface CreateAppOptions {
  argv: string[];
  version: string;
  binary: string;
}

/**
 * Runs the whole flow and returns a process exit code.
 *
 * Returning rather than calling `process.exit` keeps the function testable and lets the caller flush output first.
 */
export async function createApp(options: CreateAppOptions): Promise<number> {
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
    await run(input);
    return 0;
  } catch (error) {
    if (error instanceof PromptCancelledError) {
      cancel('Cancelled.');
      return 130;
    }

    cancel((error as Error).message);
    return 1;
  }
}

/** Resolves the dialect from `--db-dialect`, falling back to the one prompt this command asks. */
async function resolveDialect(input: ParsedInput): Promise<DatabaseDialect> {
  const flag = input.flags['db-dialect'];

  return flag === undefined ? promptDialect() : parseDialect(flag);
}

async function run(input: ParsedInput): Promise<void> {
  intro('Create a NocoBase app');

  const name = input.directory ?? (await promptAppName());
  assertValidAppName(name);

  const targetDirectory = path.resolve(process.cwd(), name);
  await assertTargetIsUsable(targetDirectory);

  const dialect = await resolveDialect(input);
  const database = defaultDatabaseConfig(dialect);
  const driver = driverFor(dialect);

  // The template registry is separate from the one that served this package: `pnpm create` resolved that before any of
  // this code ran, while the template is fetched here and defaults to the self-hosted registry carrying v3.
  const registry =
    input.flags.registry ?? process.env.NOCOBASE_REGISTRY ?? DEFAULT_REGISTRY;
  const templateSource = input.flags.template ?? DEFAULT_TEMPLATE;

  const download = spinner();
  download.start(`Downloading ${templateSource}`);

  let template;
  try {
    template = await downloadTemplate({ registry, source: templateSource });
    download.stop(`Downloaded ${template.name}@${template.version}`);
  } catch (error) {
    download.stop('Could not download the template.');
    throw error;
  }

  try {
    const envExample = await readEnvExample(template.directory);

    await scaffoldFromTemplate({
      name,
      targetDirectory,
      templateDirectory: template.directory,
      extraFiles: {
        '.env.local': buildEnvFile({ database, template: envExample }),
      },
    });
  } finally {
    await removeDirectory(template.directory);
  }

  await addDriverDependency(targetDirectory, driver);
  await ensureAllowBuilds(targetDirectory, [driver]);

  log.success(`Created ${name} using ${dialect} (${driver}).`);

  if (!input.flags.install) {
    finish(name, { installed: false, dialect });
    return;
  }

  const install = spinner();
  install.start('Installing dependencies with pnpm');

  try {
    await installDependencies({ directory: targetDirectory, driver, registry });
    install.stop('Installed dependencies.');
  } catch (error) {
    install.stop('Installing dependencies failed.');
    log.warn((error as Error).message);
    finish(name, { installed: false, dialect }, 'Finished with errors.');
    return;
  }

  if (driverNeedsBuild(driver)) {
    const verification = await verifyDriver(targetDirectory, driver);

    if (verification.rebuilt) {
      log.info(`Compiled the native addon for ${driver}.`);
    } else if (!verification.ok && verification.reason) {
      log.warn(verification.reason);
    }
  }

  finish(name, { installed: true, dialect });
}

function finish(
  name: string,
  state: { installed: boolean; dialect: DatabaseDialect },
  message = 'Done.',
): void {
  const steps = [`cd ${name}`];

  if (!state.installed) {
    steps.push('pnpm install');
  }

  steps.push('pnpm dev');

  note(steps.join('\n'), 'Next steps');

  // SQLite needs no server, so its generated defaults are already runnable. The other two point at a local server with
  // stock credentials, which is a starting shape rather than a working connection.
  if (needsConnectionDetails(state.dialect)) {
    log.info(
      `Edit .env.local to set your ${state.dialect} host, database, and credentials before starting the app.`,
    );
  } else {
    log.info('Database settings were written to .env.local.');
  }

  outro(message);
}
