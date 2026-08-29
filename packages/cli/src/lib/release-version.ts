export type ReleaseVersionBump = 'patch' | 'minor' | 'major';

export interface ReleaseVersionInput {
  readonly version?: string;
  readonly bump?: ReleaseVersionBump;
  readonly releases: readonly { readonly version: string }[];
}

export function resolveReleaseVersion(input: ReleaseVersionInput): string {
  if (input.version && input.bump) {
    throw new Error('--version and --bump cannot be used together.');
  }
  if (input.version) return format(parseVersion(input.version));
  if (!input.bump) {
    throw new Error(
      'Specify --version <major.minor.patch> or --bump patch|minor|major.',
    );
  }
  const versions = input.releases
    .map((release) => tryParseVersion(release.version))
    .filter((version): version is SemanticVersion => Boolean(version));
  if (versions.length === 0) return '0.1.0';
  versions.sort(compareVersions);
  const latest = versions.at(-1)!;
  if (input.bump === 'major') return `${latest.major + 1}.0.0`;
  if (input.bump === 'minor') return `${latest.major}.${latest.minor + 1}.0`;
  return `${latest.major}.${latest.minor}.${latest.patch + 1}`;
}

interface SemanticVersion {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

function parseVersion(value: string): SemanticVersion {
  const version = tryParseVersion(value);
  if (!version) {
    throw new Error(
      `Invalid semantic version "${value}". Use major.minor.patch, for example 1.4.0.`,
    );
  }
  return version;
}

function tryParseVersion(value: string): SemanticVersion | undefined {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(value.trim());
  if (!match) return undefined;
  const [major, minor, patch] = match.slice(1).map(Number);
  if (![major, minor, patch].every(Number.isSafeInteger)) return undefined;
  return { major, minor, patch };
}

function compareVersions(
  left: SemanticVersion,
  right: SemanticVersion,
): number {
  return (
    left.major - right.major ||
    left.minor - right.minor ||
    left.patch - right.patch
  );
}

function format(version: SemanticVersion): string {
  return `${version.major}.${version.minor}.${version.patch}`;
}
