import fs from 'node:fs';
import path from 'node:path';

import { findWorkspacePackageDirectory } from './workspace-packages.mjs';

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));

const toWatchPath = (rootDir, targetPath) =>
  path.relative(rootDir, targetPath).split(path.sep).join('/');

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

      const pluginDir = findWorkspacePackageDirectory(rootDir, packageName);
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
