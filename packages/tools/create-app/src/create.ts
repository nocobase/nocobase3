import path from 'node:path';
import { buildConfigFile } from './lib/config-file.ts';
import { formatHelp, parseInput, type ParsedInput } from './lib/flags.ts';
import {
  installDependencies,
  syncPluginSkills,
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
  spinner,
} from './lib/prompts.ts';
import {
  assertTargetIsUsable,
  assertValidAppName,
  readConfigExample,
  removeDirectory,
  scaffoldFromTemplate,
} from './lib/scaffold.ts';
import {
  DEFAULT_REGISTRY,
  downloadTemplate,
  isTemplateAlias,
  resolveTemplateKind,
  resolveTemplateSource,
  type TemplateKind,
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

  // Settled against the downloaded manifest, because a package specifier or a local path only reveals what it is once
  // it is on disk.
  const kind = resolveTemplateKind(input.flags.template, {
    name: template.name,
    nocobase: { templateKind: template.kind },
  });

  // Read before the template directory is removed below.
  const configExample = await readConfigExample(template.directory);
  const envExample =
    kind === 'hub' ? await readEnvExample(template.directory) : undefined;

  // A hub is also configured through the environment, because the path it is served under and the API it proxies are
  // deployment facts rather than application settings. Everything else it shares with an app: it owns a database, it
  // registers plugins, and it needs the secrets that only `config.yml` can carry.
  const extraFiles: Record<string, string> = {
    'config.yml': buildConfigFile({ example: configExample }),
  };

  if (kind === 'hub') {
    extraFiles['.env'] = buildHubEnvFile({ example: envExample, name });
  }

  try {
    await scaffoldFromTemplate({
      name,
      targetDirectory,
      templateDirectory: template.directory,
      extraFiles,
    });
  } finally {
    await removeDirectory(template.directory);
  }

  await ensureAllowBuilds(targetDirectory);

  log.success(`Created ${name} from ${template.name}@${template.version}.`);

  if (!input.flags.install) {
    finish(name, { installed: false, kind });
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
    finish(name, { installed: false, kind }, 'Finished with errors.');
    return;
  }

  const verification = await verifyDriver(targetDirectory);

  if (verification.rebuilt) {
    log.info('Compiled the native addon for the database driver.');
  } else if (!verification.ok && verification.reason) {
    log.warn(verification.reason);
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

  finish(name, { installed: true, kind });
}

/**
 * Prints what the user has to do next, in the order they have to do it.
 *
 * Nothing has to be edited first. A generated project starts on the SQLite connection its own
 * `server/config/database.ts` declares, and `config.yml` already carries the secrets that file cannot supply, so the
 * database is a change the user makes when they want a different one rather than a step standing between them and a
 * running application.
 *
 * A hub has to be built before it can be started, unlike an app whose `pnpm dev` compiles as it serves.
 */
function finish(
  name: string,
  state: { installed: boolean; kind: TemplateKind },
  message = 'Done.',
): void {
  const steps = [`cd ${name}`];

  if (!state.installed) {
    steps.push('pnpm install');
  }

  if (state.kind === 'hub') {
    steps.push('pnpm build', 'pnpm start');
  } else {
    steps.push('pnpm dev');
  }

  note(steps.join('\n'), 'Next steps');

  log.info(
    [
      'config.yml was generated from config.example.yml, with generated secrets. It is gitignored.',
      'The application runs on SQLite. To use another database, register its dialect in',
      'server/config/database.ts, add the matching @nocobase/db-* package, and point the connection at it.',
      ...(state.kind === 'hub'
        ? ['Hub settings, including the API it proxies, are in .env.']
        : []),
    ].join('\n'),
  );

  outro(message);
}
