// Mirror `.agents/skills/` into `.claude/skills/` as symbolic links, so Claude Code sees this repository's own Skills.
//
// `.agents/skills/` is the agent-neutral location the Skills are committed to, and Claude Code does not look there: it
// discovers Skills only under `~/.claude/skills/` and `<project>/.claude/skills/`. Without this mirror a contributor
// working in this repository gets none of its Skills, while the globally installed NocoBase 2 Skills that the root
// `AGENTS.md` tells agents to ignore stay available — exactly backwards.
//
// This is the same arrangement `nocobase skills sync` sets up inside a generated application, for the same reason.
// The difference is the direction of ownership: an application's `.agents/skills/` is generated from its installed
// packages, while this repository's is the source of truth and is committed. Only the `.claude/` mirror is ignored.
//
// Links rather than copies, so editing a Skill through either path edits the one committed file. Relative links, so
// the checkout stays movable.
import { lstat, mkdir, readdir, symlink, unlink } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

/** Directory, relative to the repository root, that holds the committed Skills. */
export const AGENT_SKILLS_DIRECTORY = path.join('.agents', 'skills');

/** Directory, relative to the repository root, that Claude Code reads Skills from. */
export const CLAUDE_SKILLS_DIRECTORY = path.join('.claude', 'skills');

/**
 * Brings `.claude/skills/` in line with `.agents/skills/`.
 *
 * A path that is not a symbolic link is never replaced: it is something this script did not write, and removing it to
 * make room would delete work it cannot restore. It is reported and skipped instead.
 */
export async function linkClaudeSkills(root) {
  const source = path.join(root, AGENT_SKILLS_DIRECTORY);
  const target = path.join(root, CLAUDE_SKILLS_DIRECTORY);
  const names = await readDirectoryNames(source);
  const linked = [];
  const removed = [];
  const skipped = [];

  for (const name of await readDirectoryNames(target, { links: true })) {
    if (names.includes(name)) continue;
    if (await removeSymbolicLink(path.join(target, name))) removed.push(name);
  }

  if (names.length > 0) await mkdir(target, { recursive: true });
  for (const name of names) {
    const linkPath = path.join(target, name);
    if (!(await removeSymbolicLink(linkPath))) {
      skipped.push(name);
      continue;
    }
    await createLink(root, name, linkPath);
    linked.push(name);
  }

  return { linked, removed, skipped };
}

async function createLink(root, name, linkPath) {
  const relativeTarget = path.join('..', '..', AGENT_SKILLS_DIRECTORY, name);
  try {
    await symlink(relativeTarget, linkPath, 'dir');
  } catch (error) {
    if (process.platform !== 'win32') throw error;
    // Windows refuses symbolic links without developer mode or elevation. A junction needs neither, but only accepts
    // an absolute target, so on that platform alone the checkout stops being movable.
    await symlink(
      path.join(root, AGENT_SKILLS_DIRECTORY, name),
      linkPath,
      'junction',
    );
  }
}

// `withFileTypes` reports a symbolic link as a link rather than as the directory it points at, so `.claude/skills/`
// has to accept both: its entries are the links this script writes, and a link whose target is already gone still has
// to be found in order to be pruned.
async function readDirectoryNames(directory, { links = false } = {}) {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    return entries
      .filter(
        (entry) => entry.isDirectory() || (links && entry.isSymbolicLink()),
      )
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    if (isNodeError(error, 'ENOENT') || isNodeError(error, 'ENOTDIR'))
      return [];
    throw error;
  }
}

/**
 * Removes `linkPath` when it is a symbolic link, reporting whether the path is now free.
 *
 * `lstat` rather than `stat` so a link to a missing target still reads as a link, and `unlink` rather than `rm` so a
 * link to a directory is removed without following it.
 */
async function removeSymbolicLink(linkPath) {
  let entry;
  try {
    entry = await lstat(linkPath);
  } catch (error) {
    if (isNodeError(error, 'ENOENT') || isNodeError(error, 'ENOTDIR'))
      return true;
    throw error;
  }
  if (!entry.isSymbolicLink()) return false;
  await unlink(linkPath);
  return true;
}

function isNodeError(error, code) {
  return error !== null && typeof error === 'object' && error.code === code;
}

/** Runs the mirror without ever failing the install that invoked it. */
export async function main(root = path.resolve(import.meta.dirname, '..')) {
  try {
    const { linked, removed, skipped } = await linkClaudeSkills(root);
    if (skipped.length > 0) {
      console.warn(
        `[nocobase3] Left ${skipped.join(', ')} in ${CLAUDE_SKILLS_DIRECTORY}: not a symbolic link. Remove it to have it linked to ${AGENT_SKILLS_DIRECTORY}.`,
      );
    }
    if (linked.length > 0 || removed.length > 0) {
      console.log(
        `Linked ${linked.length} skill(s) into ${CLAUDE_SKILLS_DIRECTORY}${removed.length > 0 ? `, removed ${removed.length} stale link(s)` : ''}.`,
      );
    }
  } catch (error) {
    // An unwritable or unusual working tree must not break `pnpm install`; the Skills are still readable where they
    // are committed.
    console.warn(
      `[nocobase3] Could not link ${AGENT_SKILLS_DIRECTORY} into ${CLAUDE_SKILLS_DIRECTORY}: ${error.message}`,
    );
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
