import { execFileSync } from 'node:child_process';
import process from 'node:process';

const SHA_PATTERN = /^[0-9a-f]{40,64}$/u;
const generatedPaths = [
  'pnpm-workspace.yaml',
  'pnpm-lock.yaml',
  '.agents/skills/nocobase-plugin-development',
];

function git(args, options = {}) {
  const output = execFileSync('git', args, {
    encoding: 'utf8',
    stdio: options.stdio ?? ['ignore', 'pipe', 'inherit'],
    ...options,
  });
  return typeof output === 'string' ? output.trim() : '';
}

function parseArguments(args) {
  const values = {};
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if (!['--metadata-source', '--oss-sha'].includes(name) || !value) {
      throw new Error(
        'Pass --metadata-source <commit> and --oss-sha <commit>.',
      );
    }
    values[name] = value;
  }
  if (!values['--metadata-source'] || !values['--oss-sha']) {
    throw new Error('Pass --metadata-source <commit> and --oss-sha <commit>.');
  }
  return {
    metadataSource: values['--metadata-source'],
    ossSha: values['--oss-sha'],
  };
}

function requireCommit(value, label) {
  if (!SHA_PATTERN.test(value))
    throw new Error(`${label} must be a full lowercase commit SHA.`);
  const resolved = git(['rev-parse', '--verify', `${value}^{commit}`]);
  if (resolved !== value)
    throw new Error(`${label} resolves to ${resolved} instead of itself.`);
}

export function reconcileReleaseMetadata({ metadataSource, ossSha }) {
  const root = git(['rev-parse', '--show-toplevel']);
  process.chdir(root);
  requireCommit(metadataSource, '--metadata-source');
  if (!SHA_PATTERN.test(ossSha))
    throw new Error('--oss-sha must be a full lowercase commit SHA.');

  git(
    [
      'restore',
      `--source=${metadataSource}`,
      '--staged',
      '--worktree',
      '--',
      ...generatedPaths,
    ],
    {
      stdio: 'inherit',
    },
  );
  git(['update-index', '--cacheinfo', `160000,${ossSha},vendor/nocobase3`], {
    stdio: 'inherit',
  });
  git(['submodule', 'update', '--init', '--recursive', 'vendor/nocobase3'], {
    stdio: 'inherit',
  });
  const checkedOut = git(['-C', 'vendor/nocobase3', 'rev-parse', 'HEAD']);
  if (checkedOut !== ossSha) {
    throw new Error(
      `vendor/nocobase3 checked out ${checkedOut} instead of ${ossSha}.`,
    );
  }

  for (const [script, args] of [
    ['scripts/sync-workspace-config.mjs', ['--write']],
    ['scripts/sync-development-skills.mjs', []],
  ]) {
    execFileSync(process.execPath, [script, ...args], { stdio: 'inherit' });
  }
  git(
    [
      'add',
      '--',
      'pnpm-workspace.yaml',
      'pnpm-lock.yaml',
      'vendor/nocobase3',
      '.agents/skills/nocobase-plugin-development',
    ],
    {
      stdio: 'inherit',
    },
  );

  const unresolved = git(['diff', '--name-only', '--diff-filter=U']);
  const generatedConflicts = unresolved
    .split('\n')
    .filter(Boolean)
    .filter((file) =>
      generatedPaths.some(
        (entry) => file === entry || file.startsWith(`${entry}/`),
      ),
    );
  if (generatedConflicts.length > 0) {
    throw new Error(
      `Generated release metadata remains conflicted: ${generatedConflicts.join(', ')}`,
    );
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    reconcileReleaseMetadata(parseArguments(process.argv.slice(2)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
