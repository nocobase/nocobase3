import fs from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

// fs.watch has no ready event and can fail asynchronously, even when creating
// just one watcher. Observe a real change before starting native-only plugins.
async function probeNativeWatch() {
  const directory = await mkdtemp(path.join(tmpdir(), 'nocobase-watch-'));
  let watcher;
  let timer;
  let interval;
  try {
    return await new Promise((resolve, reject) => {
      watcher = fs.watch(directory, () => resolve(undefined));
      watcher.once('error', (error) => {
        if (['EMFILE', 'ENFILE', 'ENOSPC', 'ENOSYS'].includes(error.code)) {
          resolve(error.code);
        } else {
          reject(error);
        }
      });
      // A change made immediately after fs.watch can precede native readiness.
      let sequence = 0;
      interval = setInterval(() => {
        try {
          fs.writeFileSync(path.join(directory, 'probe'), String(sequence++));
        } catch (error) {
          reject(error);
        }
      }, 100);
      timer = setTimeout(
        () => resolve('native watcher did not deliver events'),
        1500,
      );
    });
  } catch (error) {
    if (['EMFILE', 'ENFILE', 'ENOSPC', 'ENOSYS'].includes(error.code))
      return error.code;
    throw error;
  } finally {
    clearTimeout(timer);
    clearInterval(interval);
    watcher?.close();
    await rm(directory, { recursive: true, force: true });
  }
}

export async function resolveWatchEnvironment(env) {
  const pollingRequested = ['true', '1'].includes(env.CHOKIDAR_USEPOLLING);
  const reason = pollingRequested
    ? 'polling was requested'
    : await probeNativeWatch();
  if (!reason) return env;

  // The annotations plugin owns an unguarded fs.watch and does not support
  // Chokidar's polling setting. Keep the rest of development available.
  console.warn(
    `[dev] Using polling file watchers (${reason}). Agent annotations are disabled for this run because they require native file watching.`,
  );
  return {
    ...env,
    CHOKIDAR_USEPOLLING: 'true',
    CHOKIDAR_INTERVAL: env.CHOKIDAR_INTERVAL || '300',
    AGENT_ANNOTATIONS_ENABLED: 'false',
  };
}
