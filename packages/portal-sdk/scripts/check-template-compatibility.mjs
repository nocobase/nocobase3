import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import semver from 'semver';

const sdkRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

const readPackage = (directory) => {
  const packagePath = path.join(directory, 'package.json');
  if (!fs.existsSync(packagePath)) return undefined;
  try {
    return {
      directory,
      path: packagePath,
      value: JSON.parse(fs.readFileSync(packagePath, 'utf8')),
    };
  } catch {
    return undefined;
  }
};

const findProjectPackage = () => {
  const starts = [
    process.env.INIT_CWD,
    process.env.npm_config_local_prefix,
    process.cwd(),
  ].filter(Boolean);
  const visited = new Set();
  let fallback;

  for (const start of starts) {
    let directory = path.resolve(start);
    while (!visited.has(directory)) {
      visited.add(directory);
      const candidate = readPackage(directory);
      if (candidate && candidate.directory !== sdkRoot) {
        fallback ??= candidate;
        const pkg = candidate.value;
        if (
          pkg?.nocobase?.defaultTemplateVersion ||
          pkg?.name === '@nocobase/portal-template-default'
        ) {
          return candidate;
        }
      }
      const parent = path.dirname(directory);
      if (parent === directory) break;
      directory = parent;
    }
  }

  return fallback;
};

const isWorkspaceInstallRoot = (packageInfo) =>
  process.env.npm_lifecycle_event === 'preinstall' &&
  packageInfo?.value?.private === true &&
  fs.existsSync(path.join(packageInfo.directory, 'pnpm-workspace.yaml'));

export const checkTemplateCompatibility = ({ silent = false } = {}) => {
  const sdkPackage = readPackage(sdkRoot)?.value;
  const projectPackage = findProjectPackage();
  const supportedRange = sdkPackage?.nocobase?.supportedDefaultTemplateRange;
  const project = projectPackage?.value;
  const templateVersion =
    project?.nocobase?.defaultTemplateVersion ??
    (project?.name === '@nocobase/portal-template-default'
      ? project.version
      : undefined);

  if (!supportedRange) {
    throw new Error(
      '@nocobase/portal-sdk does not declare nocobase.supportedDefaultTemplateRange.',
    );
  }
  if (!templateVersion && isWorkspaceInstallRoot(projectPackage)) {
    if (!silent) {
      process.stdout.write(
        'Skipping Portal SDK compatibility check at workspace root.\n',
      );
    }

    return {
      compatible: true,
      defaultTemplateVersion: undefined,
      supportedDefaultTemplateRange: supportedRange,
    };
  }
  if (!templateVersion) {
    throw new Error(
      [
        'Unable to determine the NocoBase Default Template version.',
        `Project: ${projectPackage?.path ?? 'not found'}`,
        'Add nocobase.defaultTemplateVersion to the project package.json before installing the SDK.',
      ].join('\n'),
    );
  }
  if (!semver.valid(templateVersion)) {
    throw new Error(
      `Invalid nocobase.defaultTemplateVersion: ${templateVersion}`,
    );
  }
  if (!semver.validRange(supportedRange)) {
    throw new Error(
      `Invalid SDK supportedDefaultTemplateRange: ${supportedRange}`,
    );
  }

  const compatible = semver.satisfies(templateVersion, supportedRange);
  if (!compatible) {
    throw new Error(
      [
        'Incompatible NocoBase Portal SDK.',
        `Current Default Template: ${templateVersion}`,
        `Installing Portal SDK: ${sdkPackage.version}`,
        `Supported Default Template range: ${supportedRange}`,
        'Upgrade the base template first, or install a compatible @nocobase/portal-sdk version.',
      ].join('\n'),
    );
  }

  if (!silent) {
    process.stdout.write(
      `Portal SDK ${sdkPackage.version} supports Default Template ${templateVersion} (${supportedRange}).\n`,
    );
  }

  return {
    compatible,
    defaultTemplateVersion: templateVersion,
    supportedDefaultTemplateRange: supportedRange,
  };
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    checkTemplateCompatibility();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
    process.exitCode = 1;
  }
}
