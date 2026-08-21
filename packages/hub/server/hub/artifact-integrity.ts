import { createHash } from "node:crypto";
import { createReadStream, lstatSync, realpathSync } from "node:fs";
import { lstat, readdir } from "node:fs/promises";
import path from "node:path";

import { HubDomainError } from "./store.js";

const CHECKSUM_PATTERN = /^sha256:([0-9a-f]{64})$/;
const DIGEST_FORMAT = Buffer.from("nocobase-release-artifact-v1\0", "utf8");
const RECORD_SEPARATOR = Buffer.from([0]);

export interface ReleaseArtifactLocation {
  releaseRoot?: string;
  applicationSlug: string;
  storageKey?: string | null;
}

export function resolveReleaseArtifactDirectory(
  location: ReleaseArtifactLocation,
): string {
  if (!location.releaseRoot || !location.storageKey) {
    throw new HubDomainError(
      "RELEASE_ARTIFACT_UNAVAILABLE",
      "The release does not have a local artifact.",
      { status: 422 },
    );
  }
  if (path.isAbsolute(location.storageKey)) {
    throw new HubDomainError(
      "INVALID_RELEASE_STORAGE_KEY",
      "Release storageKey must be relative to the configured release root.",
      { status: 422 },
    );
  }

  const releaseRoot = path.resolve(location.releaseRoot);
  const resolved = resolveInside(releaseRoot, location.storageKey);
  const applicationRoot = resolveInside(releaseRoot, location.applicationSlug);
  const relativeStorageKey = path.relative(applicationRoot, resolved);
  if (
    relativeStorageKey === ".." ||
    relativeStorageKey.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeStorageKey)
  ) {
    throw new HubDomainError(
      "INVALID_RELEASE_STORAGE_KEY",
      "Release storageKey must be scoped to the application slug.",
      { status: 422 },
    );
  }
  assertRealStoragePath(releaseRoot, resolved);
  return resolved;
}

/**
 * Computes the v1 release artifact digest. Every regular file is covered by
 * its UTF-8 POSIX relative path, byte length, and SHA-256 content digest. File
 * records are sorted by the byte order of their relative paths. Directories
 * carry no independent metadata; symbolic links and special files are rejected.
 */
export async function computeReleaseArtifactChecksum(
  releaseDirectory: string,
): Promise<string> {
  const root = path.resolve(releaseDirectory);
  const rootStat = await lstat(root).catch((error: unknown) => {
    throw artifactUnavailable(error);
  });
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw unsupportedEntry("Release artifact root must be a real directory.");
  }

  const files = await listRegularFiles(root);
  files.sort(compareUtf8Paths);
  const artifactHash = createHash("sha256");
  artifactHash.update(DIGEST_FORMAT);

  for (const relativePath of files) {
    const absolutePath = path.join(root, ...relativePath.split("/"));
    const { digest, size } = await hashRegularFile(absolutePath);
    const sizeBytes = Buffer.alloc(8);
    sizeBytes.writeBigUInt64BE(BigInt(size));
    artifactHash.update(Buffer.from(relativePath, "utf8"));
    artifactHash.update(RECORD_SEPARATOR);
    artifactHash.update(sizeBytes);
    artifactHash.update(digest);
    artifactHash.update(RECORD_SEPARATOR);
  }

  return `sha256:${artifactHash.digest("hex")}`;
}

export async function assertReleaseArtifactChecksum(
  releaseDirectory: string,
  expectedChecksum: string,
): Promise<void> {
  const match = CHECKSUM_PATTERN.exec(expectedChecksum.trim());
  if (!match) {
    throw new HubDomainError(
      "RELEASE_CHECKSUM_INVALID",
      "Release checksum must use the sha256:<64 lowercase hex characters> format.",
      { status: 422 },
    );
  }
  const actual = await computeReleaseArtifactChecksum(releaseDirectory);
  if (actual !== `sha256:${match[1]}`) {
    throw new HubDomainError(
      "RELEASE_CHECKSUM_MISMATCH",
      "Release artifact does not match its registered checksum.",
      { status: 422 },
    );
  }
}

async function listRegularFiles(
  root: string,
  directory: string = root,
): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(
    (error: unknown) => {
      throw artifactUnavailable(error);
    },
  );
  const files: string[] = [];
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw unsupportedEntry(
        `Release artifact contains symbolic link "${relativePath(root, absolutePath)}".`,
      );
    }
    if (entry.isDirectory()) {
      files.push(...(await listRegularFiles(root, absolutePath)));
      continue;
    }
    if (!entry.isFile()) {
      throw unsupportedEntry(
        `Release artifact contains unsupported entry "${relativePath(root, absolutePath)}".`,
      );
    }
    files.push(relativePath(root, absolutePath));
  }
  return files;
}

async function hashRegularFile(
  filePath: string,
): Promise<{ digest: Buffer; size: number }> {
  const fileStat = await lstat(filePath).catch((error: unknown) => {
    throw artifactUnavailable(error);
  });
  if (!fileStat.isFile() || fileStat.isSymbolicLink()) {
    throw unsupportedEntry("Release artifact changed while it was verified.");
  }

  const hash = createHash("sha256");
  let size = 0;
  try {
    for await (const chunk of createReadStream(filePath)) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.byteLength;
      hash.update(bytes);
    }
  } catch (error) {
    throw artifactUnavailable(error);
  }
  if (size !== fileStat.size) {
    throw new HubDomainError(
      "RELEASE_ARTIFACT_CHANGED",
      "Release artifact changed while it was verified.",
      { status: 409 },
    );
  }
  return { digest: hash.digest(), size };
}

function relativePath(root: string, absolutePath: string): string {
  return path.relative(root, absolutePath).split(path.sep).join("/");
}

function compareUtf8Paths(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function resolveInside(root: string, relativePath: string): string {
  if (path.isAbsolute(relativePath)) {
    throw new HubDomainError(
      "INVALID_RELEASE_PATH",
      "Release paths must be relative.",
      { status: 422 },
    );
  }
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relativePath);
  if (
    resolved !== resolvedRoot &&
    !resolved.startsWith(`${resolvedRoot}${path.sep}`)
  ) {
    throw new HubDomainError(
      "INVALID_RELEASE_PATH",
      "Release path escapes its artifact root.",
      { status: 422 },
    );
  }
  return resolved;
}

function assertRealStoragePath(releaseRoot: string, resolved: string): void {
  const relativePath = path.relative(releaseRoot, resolved);
  let currentPath = releaseRoot;
  for (const segment of relativePath.split(path.sep)) {
    if (!segment) continue;
    currentPath = path.join(currentPath, segment);
    try {
      if (lstatSync(currentPath).isSymbolicLink()) {
        throw invalidStorageKey(
          "Release storageKey must not contain symbolic links.",
        );
      }
    } catch (error) {
      if (error instanceof HubDomainError) throw error;
      if (isMissingPathError(error)) return;
      throw artifactUnavailable(error);
    }
  }

  let realRoot: string;
  let realResolved: string;
  try {
    realRoot = realpathSync(releaseRoot);
    realResolved = realpathSync(resolved);
  } catch (error) {
    if (isMissingPathError(error)) return;
    throw artifactUnavailable(error);
  }
  const realRelativePath = path.relative(realRoot, realResolved);
  if (
    realRelativePath === ".." ||
    realRelativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(realRelativePath)
  ) {
    throw invalidStorageKey(
      "Release storageKey resolves outside the configured release root.",
    );
  }
}

function invalidStorageKey(message: string): HubDomainError {
  return new HubDomainError("INVALID_RELEASE_STORAGE_KEY", message, {
    status: 422,
  });
}

function isMissingPathError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

function unsupportedEntry(message: string): HubDomainError {
  return new HubDomainError("RELEASE_ARTIFACT_UNSUPPORTED_ENTRY", message, {
    status: 422,
  });
}

function artifactUnavailable(cause: unknown): HubDomainError {
  return new HubDomainError(
    "RELEASE_ARTIFACT_UNAVAILABLE",
    "Release artifact could not be read for checksum verification.",
    { status: 422, cause },
  );
}
