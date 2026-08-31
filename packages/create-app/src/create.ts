import path from 'node:path';
import {
  defaultDatabaseConfig,
  driverFor,
  driverNeedsBuild,
  needsConnectionDetails,
  parseDialect,
  type DatabaseDialect,
} from './lib/database.ts';
import { buildConfigFile } from './lib/config-file.ts';
import { formatHelp, parseInput, type ParsedInput } from './lib/flags.ts';
import {
  installDependencies,
  syncPluginSkills,
  verifyDriver,
} from './lib/install.ts';
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
  removeDirectory,
  scaffoldFromTemplate,
} from './lib/scaffold.ts';
import {
  DEFAULT_REGISTRY,
  downloadTemplate,
  resolveTemplateSource,
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
  const templateSource = resolveTemplateSource(input.flags.template, {
    tag: input.flags['template-tag'],
  });

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
    await scaffoldFromTemplate({
      name,
      targetDirectory,
      templateDirectory: template.directory,
      extraFiles: {
        'config.yml': buildConfigFile({ database }),
      },
    });
  } finally {
    await removeDirectory(template.directory);
  }

  await addDriverDependency(targetDirectory, driver);
  await ensureAllowBuilds(targetDirectory);

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

  // Runs only after the install, because the sync reads the plugins out of `node_modules`.
  const skills = spinner();
  skills.start('Synchronizing plugin skills');

  const synchronized = await syncPluginSkills(targetDirectory);

  if (synchronized.ok) {
    skills.stop('Synchronized plugin skills.');
  } else {
    skills.stop('Synchronizing plugin skills failed.');
    log.warn(synchronized.reason ?? 'Could not synchronize plugin skills.');
  }

  finish(name, { installed: true, dialect });
}

/**
 * Prints what the user has to do next, in the order they have to do it.
 *
 * Editing `config.yml` is a step rather than a trailing remark, because for postgres and mysql it is the one thing
 * standing between a generated project and a running one: the file holds stock credentials pointing at localhost, so
 * `pnpm dev` fails on connection until it is filled in. SQLite needs no server and its generated defaults already
 * work, so there the file is only worth mentioning.
 */
function finish(
  name: string,
  state: { installed: boolean; dialect: DatabaseDialect },
  message = 'Done.',
): void {
  const mustEditConfig = needsConnectionDetails(state.dialect);
  const steps = [`cd ${name}`];

  if (mustEditConfig) {
    steps.push(`edit config.yml — set your ${state.dialect} connection`);
  }

  if (!state.installed) {
    steps.push('pnpm install');
  }

  steps.push('pnpm dev');

  note(steps.join('\n'), 'Next steps');

  log.info(
    mustEditConfig
      ? `config.yml contains default ${state.dialect} connection values. Update them before starting the app.`
      : 'Database settings were written to config.yml, and the defaults work as they are.',
  );

  outro(message);
}
