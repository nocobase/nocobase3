import { createHash } from 'node:crypto';
import { createReadStream, constants } from 'node:fs';
import {
  copyFile,
  chmod,
  lstat,
  mkdir,
  readdir,
  readlink,
  symlink,
  utimes,
} from 'node:fs/promises';
import path from 'node:path';

export interface StorageCopy {
  source: string;
  target: string;
}

export async function exists(filename: string): Promise<boolean> {
  try {
    await lstat(filename);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

async function hash(filename: string): Promise<string> {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(filename))
    digest.update(chunk as Buffer);
  return digest.digest('hex');
}

/** Checks conflicts before copying; retries accept only identical files and links. Never deletes source data. */
export async function copyStorage(
  entry: StorageCopy,
  apply: boolean,
): Promise<void> {
  if (path.resolve(entry.source) === path.resolve(entry.target)) return;
  if (
    path
      .resolve(entry.target)
      .startsWith(`${path.resolve(entry.source)}${path.sep}`)
  )
    throw new Error(
      `Cannot copy a storage directory into itself: ${entry.source}`,
    );
  const source = await lstat(entry.source);
  const targetExists = await exists(entry.target);
  if (targetExists) {
    const target = await lstat(entry.target);
    const same =
      (source.isDirectory() && target.isDirectory()) ||
      (source.isFile() &&
        target.isFile() &&
        source.size === target.size &&
        (await hash(entry.source)) === (await hash(entry.target))) ||
      (source.isSymbolicLink() &&
        target.isSymbolicLink() &&
        (await readlink(entry.source)) === (await readlink(entry.target)));
    if (!same) throw new Error(`Storage migration conflict: ${entry.target}`);
  }
  if (source.isDirectory()) {
    if (apply)
      await mkdir(entry.target, { recursive: true, mode: source.mode & 0o777 });
    for (const name of await readdir(entry.source))
      await copyStorage(
        {
          source: path.join(entry.source, name),
          target: path.join(entry.target, name),
        },
        apply,
      );
  } else if (apply && !targetExists) {
    await mkdir(path.dirname(entry.target), { recursive: true, mode: 0o700 });
    if (source.isSymbolicLink())
      await symlink(await readlink(entry.source), entry.target);
    else if (source.isFile()) {
      await copyFile(entry.source, entry.target, constants.COPYFILE_EXCL);
      if ((await hash(entry.source)) !== (await hash(entry.target)))
        throw new Error(`Storage copy verification failed: ${entry.target}`);
      await chmod(entry.target, source.mode & 0o777);
      await utimes(entry.target, source.atime, source.mtime);
    } else throw new Error(`Unsupported storage entry: ${entry.source}`);
  }
}
