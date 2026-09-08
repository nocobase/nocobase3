import fs from 'node:fs';
import path from 'node:path';

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));

// Workspace packages are grouped one directory below the packages root — `packages/plugins/app-plugin-file` rather than `packages/app-plugin-file` — so this application's own parent directory holds only the other templates. Scanning it alone finds no plugins at all, which is why the packages root is located first and the group directories are scanned below it.
//
// A flat `packages/<name>` layout keeps working because the scan falls back to a single level, and a generated application, whose parent is an ordinary directory rather than a workspace, keeps the same single-level behaviour it had before.
const resolveWorkspacePackagesRoot = (rootDir) => {
  const groupedRoot = path.resolve(rootDir, '../..');
  if (path.basename(groupedRoot) === 'packages') {
    return { root: groupedRoot, depth: 2 };
  }

  return { root: path.resolve(rootDir, '..'), depth: 1 };
};

const collectPackageDirectories = (directory, depth) => {
  if (depth < 1 || !fs.existsSync(directory)) return [];

  return fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== 'node_modules')
    .flatMap((entry) => {
      const entryPath = path.join(directory, entry.name);
      if (fs.existsSync(path.join(entryPath, 'package.json'))) {
        return [entryPath];
      }

      return collectPackageDirectories(entryPath, depth - 1);
    });
};

/** Maps every workspace package name that neighbours this application to its directory. */
export const listWorkspacePackages = (rootDir) => {
  const { root, depth } = resolveWorkspacePackagesRoot(rootDir);

  return new Map(
    collectPackageDirectories(root, depth)
      .map((packageDir) => [
        readJson(path.join(packageDir, 'package.json')).name,
        packageDir,
      ])
      .filter(([name]) => typeof name === 'string'),
  );
};

/** Resolves one workspace package directory by package name, or `undefined` when it is not part of the workspace. */
export const findWorkspacePackageDirectory = (rootDir, packageName) =>
  listWorkspacePackages(rootDir).get(packageName);
