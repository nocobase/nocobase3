import path from 'node:path';

const CODE = /\.(?:[cm]?[jt]sx?)$/u;
const FORMATTABLE =
  /\.(?:[cm]?[jt]sx?|json5?|jsonc|mdx?|ya?ml|css|scss|less|html)$/u;

/**
 * ESLint runs once per package rather than once for every staged file.
 *
 * The type-aware rules build a TypeScript program per file and hold it for the length of the run, so a single process
 * grows with the size of the commit. A repository-wide change — a refactor that moves every package, a dependency bump
 * that rewrites every manifest — exhausts the heap, and the hook dies with an allocation failure rather than a lint
 * result. Splitting by package bounds it: each process exits and frees what it held before the next starts.
 *
 * Grouping costs nothing for an ordinary commit, which touches one or two packages and so produces one or two
 * commands, the same as before.
 *
 * Prettier still takes every staged file in one command. It formats a file at a time with no cross-file analysis, so
 * its memory does not scale with the size of the commit the way ESLint's does.
 */
const groupByPackage = (files) => {
  const groups = new Map();

  for (const file of files) {
    const relative = path.relative(import.meta.dirname, file);
    const segments = relative.split(path.sep);
    // `packages/<category>/<name>` is a package; anything else is grouped as the repository root, which the root
    // ESLint configuration covers.
    const key =
      segments[0] === 'packages' && segments.length > 3
        ? segments.slice(0, 3).join('/')
        : '';
    const group = groups.get(key);
    if (group) group.push(file);
    else groups.set(key, [file]);
  }

  return [...groups.values()];
};

export default {
  '*': (files) => {
    const code = files.filter((file) => CODE.test(file));
    const formattable = files.filter((file) => FORMATTABLE.test(file));
    const commands = groupByPackage(code).map(
      (group) =>
        `eslint --fix --no-warn-ignored --max-warnings 0 ${group.map((file) => JSON.stringify(file)).join(' ')}`,
    );

    if (formattable.length > 0) {
      commands.push(
        `prettier --write ${formattable.map((file) => JSON.stringify(file)).join(' ')}`,
      );
    }

    return commands;
  },
};
