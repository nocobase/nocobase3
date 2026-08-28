// Renders GitHub Release notes for an aggregate release tag.
//
// A release commit carries every tag the release produced: the aggregate tag
// (`release-beta/2026-08-26.5`) and one `name@version` tag per package that
// `changeset publish` actually published. That is the whole manifest, recorded
// by the release itself — this script reads it back rather than reconstructing it.
//
// Everything is read out of the tagged commit with `git show`, never from the
// working tree, so notes for any past release can be rendered at any later time.
//
// Usage:
//   node scripts/release-notes.mjs <aggregate-tag>            print the notes
//   node scripts/release-notes.mjs <aggregate-tag> --packages print `name@version` per line
import { execFileSync } from 'node:child_process';

const AGGREGATE_PATTERN = /^release(-beta)?\/\d{4}-\d{2}-\d{2}\.\d+$/u;

function git(args) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
}

function gitOrUndefined(args) {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return undefined;
  }
}

export function parseAggregateTag(tag) {
  if (!AGGREGATE_PATTERN.test(tag)) {
    throw new Error(`Not an aggregate release tag: ${tag}`);
  }
  const [prefix, batch] = tag.split('/');
  return { batch, channel: prefix === 'release-beta' ? 'beta' : 'stable' };
}

// A package tag is `<name>@<version>`, and scoped names carry their own `@`.
// Splitting on the last `@` is what keeps `@nocobase/create-app@0.1.0-beta.4`
// from parsing as an empty name.
export function parsePackageTag(tag) {
  const at = tag.lastIndexOf('@');
  if (at <= 0) return undefined;
  const name = tag.slice(0, at);
  const version = tag.slice(at + 1);
  if (!name || !version || !/^\d/u.test(version)) return undefined;
  return { name, version };
}

export function readPackagesFromTags(tags) {
  return tags
    .map((tag) => parsePackageTag(tag))
    .filter(Boolean)
    .sort((left, right) =>
      left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
    );
}

// Reads `## <version>` out of a CHANGELOG, stopping at the next `## ` heading.
// Changesets writes exactly one such heading per released version.
export function extractChangelogSection(changelog, version) {
  const lines = changelog.replaceAll('\r\n', '\n').split('\n');
  const heading = `## ${version}`;
  const start = lines.findIndex((line) => line.trimEnd() === heading);
  if (start === -1) return undefined;

  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^##\s/u.test(lines[index])) {
      end = index;
      break;
    }
  }
  return (
    lines
      .slice(start + 1, end)
      .join('\n')
      .trim() || undefined
  );
}

function findPackageDirectories(commit) {
  const listing = gitOrUndefined([
    'ls-tree',
    '--name-only',
    `${commit}:packages`,
  ]);
  if (!listing) return [];
  return listing
    .split('\n')
    .filter(Boolean)
    .map((entry) => entry.replace(/\/$/u, ''));
}

// Maps published package names back to their directory in the tagged tree, so
// the changelog can be read from the same commit the release was cut from.
export function resolveDirectories(commit, directories) {
  const byName = new Map();
  for (const directory of directories) {
    const raw = gitOrUndefined([
      'show',
      `${commit}:packages/${directory}/package.json`,
    ]);
    if (!raw) continue;
    try {
      const { name } = JSON.parse(raw);
      if (name) byName.set(name, directory);
    } catch {
      // A package.json that does not parse cannot be matched to a tag; the
      // package simply renders without changelog details.
    }
  }
  return byName;
}

export function renderReleaseNotes(tag) {
  const { batch, channel } = parseAggregateTag(tag);
  // The aggregate tag and the release branch share a name while a release is in
  // flight, so a bare ref is ambiguous — resolve through refs/tags/ explicitly.
  const commit = git(['rev-parse', `refs/tags/${tag}^{commit}`]).trim();
  const tagsAtCommit = git(['tag', '--points-at', commit])
    .split('\n')
    .filter(Boolean);
  const packages = readPackagesFromTags(tagsAtCommit);

  if (packages.length === 0) {
    throw new Error(
      `No package tags point at ${commit} — nothing was published for ${tag}`,
    );
  }

  const directories = resolveDirectories(
    commit,
    findPackageDirectories(commit),
  );
  const label = channel === 'beta' ? 'Beta release' : 'Stable release';
  const lines = [
    `${label} \`${batch}\` published ${packages.length} package${packages.length === 1 ? '' : 's'}.`,
    '',
    '| Package | Version |',
    '| --- | --- |',
    ...packages.map((pkg) => `| \`${pkg.name}\` | \`${pkg.version}\` |`),
  ];

  for (const pkg of packages) {
    const directory = directories.get(pkg.name);
    const changelog = directory
      ? gitOrUndefined(['show', `${commit}:packages/${directory}/CHANGELOG.md`])
      : undefined;
    const section = changelog
      ? extractChangelogSection(changelog, pkg.version)
      : undefined;
    lines.push('', `## \`${pkg.name}@${pkg.version}\``, '');
    lines.push(
      section ?? '_No changelog entry was recorded for this version._',
    );
  }

  return `${lines.join('\n')}\n`;
}

export function formatPackageList(tag) {
  const commit = git(['rev-parse', `refs/tags/${tag}^{commit}`]).trim();
  const packages = readPackagesFromTags(
    git(['tag', '--points-at', commit]).split('\n').filter(Boolean),
  );
  return packages.map((pkg) => `${pkg.name}@${pkg.version}`).join('\n');
}

const isMain = process.argv[1]?.endsWith('release-notes.mjs');
if (isMain) {
  const [tag, ...flags] = process.argv.slice(2);
  try {
    if (!tag) throw new Error('Usage: release-notes.mjs <aggregate-tag>');
    const output = flags.includes('--packages')
      ? `${formatPackageList(tag)}\n`
      : renderReleaseNotes(tag);
    process.stdout.write(output);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
