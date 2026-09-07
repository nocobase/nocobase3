import path from 'node:path';
import {
  defaultDatabaseConfig,
  driverFor,
  driverNeedsBuild,
  needsConnectionDetails,
  parseDialect,
  type DatabaseDialect,
  type DatabaseConfig,
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
  isTemplateAlias,
  resolveTemplateKind,
  resolveTemplateSource,
} from './lib/template.ts';
import { buildHubEnvFile, readEnvExample } from './lib/hub.ts';

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
  // A name settles what is being created without downloading anything. A package specifier or a local path does not,
  // and guessing would put the wrong word in front of the user for the whole run, so the introduction stays neutral
  // until the template itself says which it is.
  const named = isTemplateAlias(input.flags.template)
    ? resolveTemplateKind(input.flags.template)
    : undefined;

  intro(
    named === 'hub'
      ? 'Create a NocoBase hub'
      : named === 'app'
        ? 'Create a NocoBase app'
        : 'Create a NocoBase project',
  );

  const name = input.directory ?? (await promptAppName());
  assertValidAppName(name);

  const targetDirectory = path.resolve(process.cwd(), name);
  await assertTargetIsUsable(targetDirectory);

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

  // Identity and initialization capabilities are independent and come from the downloaded template.
  const kind = resolveTemplateKind(input.flags.template, {
    name: template.name,
    nocobase: { templateKind: template.kind },
  });

  let database: DatabaseConfig;
  try {
    if (kind === 'hub' && template.scaffoldProfile === undefined) {
      if (input.flags['db-dialect'] !== undefined) {
        log.warn(
          '--db-dialect is ignored because this Hub template does not declare the app-v1 scaffold profile.',
        );
      }

      await createHub({ input, name, targetDirectory, template });
      return;
    }

    database = defaultDatabaseConfig(await resolveDialect(input));
    const extraFiles: Record<string, string> = {
      'config.yml': buildConfigFile({ database }),
    };
    if (kind === 'hub') {
      extraFiles['.env'] = buildHubEnvFile({
        example: await readEnvExample(template.directory),
        name,
      });
      extraFiles[path.join('app-dist', '.gitkeep')] = '';
    }

    await scaffoldFromTemplate({
      name,
      targetDirectory,
      templateDirectory: template.directory,
      extraFiles,
    });
  } finally {
    await removeDirectory(template.directory);
  }

  const driver = driverFor(database.dialect);
  await addDriverDependency(targetDirectory, driver);
  await ensureAllowBuilds(targetDirectory);

  const dialect = database.dialect;
  if (kind === 'hub') {
    log.info(
      'Created a full-stack Hub. Identity and mount settings were written to .env.',
    );
  }

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

interface CreateHubOptions {
  input: ParsedInput;
  name: string;
  targetDirectory: string;
  template: { directory: string; name: string; version: string };
}

/** Preserves initialization for Hub templates without the full-stack App profile. */
async function createHub(options: CreateHubOptions): Promise<void> {
  const { input, name, targetDirectory, template } = options;
  const registry =
    input.flags.registry ?? process.env.NOCOBASE_REGISTRY ?? DEFAULT_REGISTRY;

  const envExample = await readEnvExample(template.directory);
  await scaffoldFromTemplate({
    name,
    targetDirectory,
    templateDirectory: template.directory,
    extraFiles: {
      '.env': buildHubEnvFile({ example: envExample, name }),
      [path.join('app-dist', '.gitkeep')]: '',
    },
  });

  await ensureAllowBuilds(targetDirectory);

  log.success(`Created hub ${name} from ${template.name}@${template.version}.`);

  if (!input.flags.install) {
    finishHub(name, { installed: false });
    return;
  }

  const install = spinner();
  install.start('Installing dependencies with pnpm');

  try {
    await installDependencies({ directory: targetDirectory, registry });
    install.stop('Installed dependencies.');
  } catch (error) {
    install.stop('Installing dependencies failed.');
    log.warn((error as Error).message);
    finishHub(name, { installed: false }, 'Finished with errors.');
    return;
  }

  finishHub(name, { installed: true });
}

/** Prints the existing build/start instructions for a legacy Hub template. */
function finishHub(
  name: string,
  state: { installed: boolean },
  message = 'Done.',
): void {
  const steps = [`cd ${name}`];

  if (!state.installed) {
    steps.push('pnpm install');
  }

  steps.push('pnpm build', 'pnpm start');

  note(steps.join('\n'), 'Next steps');

  log.info(
    'Hub settings were written to .env. This template does not declare App database initialization.',
  );

  outro(message);
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
