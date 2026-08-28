// Tells Tailwind which plugin files to scan for utility classes.
//
// `@source "../node_modules/@nocobase/app-plugin-*/client"` cannot do this job. pnpm links every dependency as a
// symlink into its store, and Tailwind's scanner does not expand a wildcard through one — the glob silently matches
// nothing, in this repository and in a generated application alike. Reading the directory first and resolving each
// match to its real path gets past that, because `readdirSync` sees the symlinks and `realpathSync` resolves them.
//
// Both `client` and `dist/client` are searched: a workspace plugin exposes TypeScript sources, while an installed one
// ships only its build output. Whichever a plugin has is scanned, and the other is skipped.
import { existsSync, globSync, readdirSync, realpathSync } from 'node:fs';
import path from 'node:path';

const SOURCE_DIRECTORIES = ['client', 'dist/client', 'src', 'dist/src'];
const SCANNED_FILES = '**/*.{js,jsx,ts,tsx}';

/** Every scannable directory a workspace or installed `@nocobase` package exposes. */
function scannedDirectories() {
  const scope = path.resolve(import.meta.dirname, 'node_modules/@nocobase');
  if (!existsSync(scope)) {
    return [];
  }

  const directories = [];
  for (const packageName of readdirSync(scope)) {
    // app-client contributes the shared components an application renders; the plugins contribute their own pages.
    if (
      !packageName.startsWith('app-plugin-') &&
      packageName !== 'app-client'
    ) {
      continue;
    }
    for (const directory of SOURCE_DIRECTORIES) {
      const candidate = path.join(scope, packageName, directory);
      if (existsSync(candidate)) {
        directories.push(realpathSync(candidate));
      }
    }
  }
  return directories;
}

function contentFiles() {
  const files = [];
  for (const directory of scannedDirectories()) {
    for (const file of globSync(SCANNED_FILES, { cwd: directory })) {
      files.push(path.join(directory, file));
    }
  }
  return files;
}

export default { content: contentFiles() };
