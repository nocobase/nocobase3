import { execFile } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

import {
  archiveNameForPackage,
  discoverPackages,
  readPackedManifest,
  validatePackedManifest,
} from './pack-check.mjs';

const execFileAsync = promisify(execFile);

export function validateLoopbackRegistry(value) {
  let registry;
  try {
    registry = new URL(value);
  } catch (error) {
    throw new Error(`Invalid registry URL: ${value}`, { cause: error });
  }

  if (!['http:', 'https:'].includes(registry.protocol)) {
    throw new Error(
      `Artifact publishing requires an HTTP(S) loopback registry, received ${registry.protocol}`,
    );
  }
  if (registry.username || registry.password) {
    throw new Error('Registry credentials must come from the isolated npmrc.');
  }
  if (registry.search || registry.hash) {
    throw new Error('The registry URL must not include a query or fragment.');
  }

  const hostname = registry.hostname.replace(/^\[(.*)\]$/u, '$1');
  const ipVersion = net.isIP(hostname);
  const isLoopback =
    hostname === 'localhost' ||
    hostname === '::1' ||
    (ipVersion === 4 && hostname.startsWith('127.'));
  if (!isLoopback) {
    throw new Error(
      `Artifact publishing is restricted to a loopback registry, received ${registry.origin}`,
    );
  }

  return registry.href.endsWith('/') ? registry.href : `${registry.href}/`;
}

export async function validatePackArtifacts({
  artifactsDirectory,
  registry,
  repoRoot = path.resolve(import.meta.dirname, '..'),
}) {
  const safeRegistry = validateLoopbackRegistry(registry);
  const directory = path.resolve(artifactsDirectory);
  const packages = await discoverPackages(repoRoot);
  const expectedByName = new Map(
    packages.map((packageInfo) => [packageInfo.manifest.name, packageInfo]),
  );
  const entries = await readdir(directory, { withFileTypes: true });
  const archivePaths = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.tgz'))
    .map((entry) => path.join(directory, entry.name))
    .sort();

  const archivesByName = new Map();
  const errors = [];

  for (const archivePath of archivePaths) {
    let packedManifest;
    try {
      packedManifest = await readPackedManifest(archivePath);
    } catch (error) {
      errors.push(
        `${path.basename(archivePath)} is not a readable npm package: ${error.message}`,
      );
      continue;
    }

    const packageInfo = expectedByName.get(packedManifest.name);
    if (!packageInfo) {
      errors.push(
        `${path.basename(archivePath)} contains unexpected package ${packedManifest.name ?? '<unnamed>'}@${packedManifest.version ?? '<unversioned>'}`,
      );
      continue;
    }
    if (archivesByName.has(packedManifest.name)) {
      errors.push(
        `Duplicate artifact for ${packedManifest.name}: ${path.basename(archivesByName.get(packedManifest.name))} and ${path.basename(archivePath)}`,
      );
      continue;
    }

    const expectedArchiveName = archiveNameForPackage(packedManifest.name);
    if (path.basename(archivePath) !== expectedArchiveName) {
      errors.push(
        `${packedManifest.name} must use pack-check archive name ${expectedArchiveName}, received ${path.basename(archivePath)}`,
      );
    }

    try {
      validatePackedManifest(packageInfo.manifest, packedManifest);
    } catch (error) {
      errors.push(error.message);
    }
    const configuredRegistry = packedManifest.publishConfig?.registry;
    if (configuredRegistry !== undefined) {
      try {
        const normalizedRegistry = validateLoopbackRegistry(configuredRegistry);
        if (normalizedRegistry !== safeRegistry) {
          errors.push(
            `${packedManifest.name} publishConfig.registry resolves to ${normalizedRegistry}, expected ${safeRegistry}`,
          );
        }
      } catch (error) {
        errors.push(
          `${packedManifest.name} has unsafe publishConfig.registry: ${error.message}`,
        );
      }
    }
    archivesByName.set(packedManifest.name, archivePath);
  }

  for (const packageInfo of packages) {
    if (!archivesByName.has(packageInfo.manifest.name)) {
      errors.push(
        `Missing artifact ${archiveNameForPackage(packageInfo.manifest.name)} for ${packageInfo.manifest.name}@${packageInfo.manifest.version}`,
      );
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Invalid package artifacts:\n${errors.map((error) => `  - ${error}`).join('\n')}`,
    );
  }

  return packages.map((packageInfo) => ({
    archivePath: archivesByName.get(packageInfo.manifest.name),
    name: packageInfo.manifest.name,
    version: packageInfo.manifest.version,
  }));
}

export function npmPublishArguments(archivePath, registry) {
  return [
    'publish',
    archivePath,
    '--ignore-scripts',
    '--provenance=false',
    '--tag',
    'smoke',
    '--registry',
    registry,
  ];
}

async function publishWithNpm({ archivePath, env, registry }) {
  return execFileAsync('npm', npmPublishArguments(archivePath, registry), {
    env,
  });
}

export async function publishPackArtifacts({
  artifactsDirectory,
  concurrency = 4,
  env = process.env,
  publish = publishWithNpm,
  registry,
  repoRoot = path.resolve(import.meta.dirname, '..'),
}) {
  const safeRegistry = validateLoopbackRegistry(registry);
  if (
    !Number.isSafeInteger(concurrency) ||
    concurrency < 1 ||
    concurrency > 16
  ) {
    throw new Error('Publish concurrency must be an integer between 1 and 16.');
  }

  // Validate the complete set before the first publish. A partial local registry can otherwise resolve missing
  // workspace packages through an upstream and make the generated application test artifacts from the wrong build.
  const artifacts = await validatePackArtifacts({
    artifactsDirectory,
    registry: safeRegistry,
    repoRoot,
  });
  let nextIndex = 0;
  let publishFailure;

  const worker = async () => {
    while (!publishFailure && nextIndex < artifacts.length) {
      const index = nextIndex;
      nextIndex += 1;
      const artifact = artifacts[index];
      try {
        await publish({
          archivePath: artifact.archivePath,
          env,
          registry: safeRegistry,
        });
        console.log(
          `[${index + 1}/${artifacts.length}] ${artifact.name}@${artifact.version} published`,
        );
      } catch (error) {
        const output = [error.stdout?.trim(), error.stderr?.trim()]
          .filter(Boolean)
          .join('\n');
        publishFailure ??= new Error(
          `Failed to publish ${artifact.name}@${artifact.version}.${output ? `\n${output}` : ''}`,
          { cause: error },
        );
      }
    }
  };

  // Once one publish fails, workers finish only the commands already in flight and take no more artifacts. Waiting
  // for every worker prevents npm subprocesses from continuing after this command has reported failure to the action.
  await Promise.all(
    Array.from({ length: Math.min(concurrency, artifacts.length) }, worker),
  );
  if (publishFailure) throw publishFailure;
}

function parseArguments(args) {
  const options = { concurrency: 4, validateOnly: false };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--validate-only') {
      options.validateOnly = true;
      continue;
    }
    if (['--artifacts', '--concurrency', '--registry'].includes(argument)) {
      const value = args[index + 1];
      if (!value) throw new Error(`${argument} requires a value.`);
      index += 1;
      if (argument === '--artifacts') options.artifactsDirectory = value;
      if (argument === '--concurrency') options.concurrency = Number(value);
      if (argument === '--registry') options.registry = value;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }
  if (!options.artifactsDirectory || !options.registry) {
    throw new Error('--artifacts and --registry are required.');
  }
  return options;
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  const options = parseArguments(process.argv.slice(2));
  const registry = validateLoopbackRegistry(options.registry);
  if (options.validateOnly) {
    const artifacts = await validatePackArtifacts({
      artifactsDirectory: options.artifactsDirectory,
      registry,
    });
    console.log(
      `Validated ${artifacts.length} package artifacts for ${registry}`,
    );
  } else {
    await publishPackArtifacts({
      artifactsDirectory: options.artifactsDirectory,
      concurrency: options.concurrency,
      registry,
    });
  }
}
