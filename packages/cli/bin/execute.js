import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  formatUnsupportedNodeVersionMessage,
  isSupportedNodeVersion,
} from './node-version.js';

/**
 * Runs one of the package's command surfaces.
 *
 * Generated-app package scripts load their small public command tree from source in a workspace checkout and from
 * compiled output in a published installation.
 */
export async function executeCommandSurface(options) {
  if (!isSupportedNodeVersion()) {
    console.error(
      formatUnsupportedNodeVersionMessage(
        process.version,
        options.nodeVersionLabel ?? options.errorLabel,
      ),
    );
    process.exit(1);
  }

  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const sourceDirectory = path.join(root, 'src', options.sourceDirectory);
  const useDist =
    process.env.NB3_CLI_USE_DIST === '1' || !existsSync(sourceDirectory);
  const commandsDirectory = useDist
    ? `./dist/${options.sourceDirectory}`
    : `./src/${options.sourceDirectory}`;
  const pjson = JSON.parse(
    readFileSync(path.join(root, 'package.json'), 'utf8'),
  );

  pjson.oclif.bin = options.bin;
  pjson.oclif.dirname = options.dirname;
  pjson.oclif.commands = commandsDirectory;
  if (options.sourceDirectory === 'app-scripts') {
    delete pjson.oclif.topics;
    pjson.oclif.topicSeparator = ':';
  }
  pjson.oclif.helpClass = useDist
    ? './dist/help/runtime-help.js'
    : './src/help/runtime-help.ts';

  const { Config, flush, run, settings } = await import('@oclif/core');

  if (!useDist) {
    settings.debug = Boolean(process.env.NB3_CLI_DEBUG);
  }

  try {
    const config = await Config.load({ pjson, root });
    await run(options.argv, config);
    await flush();
  } catch (error) {
    const oclifExit = error?.oclif?.exit;
    if (typeof oclifExit === 'number') {
      if (error.message && oclifExit !== 0) {
        console.error(error.message);
      }
      process.exit(oclifExit);
    }

    console.error(
      error?.message ? `[${options.errorLabel}]: ${error.message}` : error,
    );
    process.exit(1);
  }
}
