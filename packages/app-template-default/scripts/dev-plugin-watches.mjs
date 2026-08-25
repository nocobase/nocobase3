import fs from 'node:fs';
import path from 'node:path';

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));

const toWatchPath = (rootDir, targetPath) =>
  path.relative(rootDir, targetPath).split(path.sep).join('/');

const resolveWorkspacePluginDirectory = (rootDir, packageName) => {
  const directoryName = packageName.split('/').at(-1);
  if (!directoryName) {
    return undefined;
  }

  const pluginDir = path.resolve(rootDir, '..', directoryName);
  const packagePath = path.join(pluginDir, 'package.json');
  if (!fs.existsSync(packagePath)) {
    return undefined;
  }

  const pluginPackage = readJson(packagePath);
  return pluginPackage.name === packageName ? pluginDir : undefined;
};

export const resolvePluginWatchIncludes = (rootDir) => {
  const appPackage = readJson(path.join(rootDir, 'package.json'));
  const pluginRegistry = appPackage.nocobase?.plugins;
  if (!pluginRegistry || typeof pluginRegistry !== 'object') {
    return [];
  }

  return Object.entries(pluginRegistry).flatMap(
    ([packageName, registration]) => {
      if (
        !registration ||
        typeof registration !== 'object' ||
        registration.enabled !== true
      ) {
        return [];
      }

      const pluginDir = resolveWorkspacePluginDirectory(rootDir, packageName);
      if (!pluginDir) {
        return [];
      }

      const relativePluginDir = toWatchPath(rootDir, pluginDir);
      return [
        `${relativePluginDir}/package.json`,
        `${relativePluginDir}/database/**/*`,
        `${relativePluginDir}/server/**/*`,
      ];
    },
  );
};
