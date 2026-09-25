import fs from 'node:fs';
import path from 'node:path';

export const DEV_INSTANCE_LOCK_FILE = path.join('storage', '.dev-server.lock');

const isRunning = (pid) => {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means a process with that id exists under another user.
    return error.code === 'EPERM';
  }
};

const readLock = (file) => {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return typeof parsed === 'object' && parsed ? parsed : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Refuses a second development server for one application root.
 *
 * Two of them are not caught by anything else: the port check advances to the
 * next free port instead of failing, and the second server then dies where
 * nothing points back at the cause — on the migration lock the first one is
 * holding, before it ever binds a port. A stale lock left by a killed run is
 * taken over rather than reported, because its process is gone.
 */
export function acquireDevInstanceLock({
  rootDir,
  pid = process.pid,
  startedAt = Date.now(),
}) {
  const file = path.join(rootDir, DEV_INSTANCE_LOCK_FILE);
  const existing = readLock(file);
  if (existing && existing.pid !== pid && isRunning(existing.pid)) {
    return {
      acquired: false,
      pid: existing.pid,
      startedAt: existing.startedAt,
    };
  }

  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify({ pid, startedAt }, null, 2)}\n`);
  return {
    acquired: true,
    release() {
      // Only ever remove our own: a run that took over a stale lock and a run
      // that started after this one must not delete each other's.
      if (readLock(file)?.pid !== pid) return;
      try {
        fs.rmSync(file, { force: true });
      } catch {
        // A removed storage directory is not worth failing a shutdown over.
      }
    },
  };
}
