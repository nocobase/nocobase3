import { spawn } from 'node:child_process';
import { loadStandaloneAppEnv } from '@nocobase/app-server/node';

import { watchConfigFiles } from './config-watch.mjs';

// Keep dotenv values inside the child. Reusing its resolved environment would
// make deleted keys override the next read of .env and .env.local.
export function superviseDevelopment({
  rootDir,
  entry,
  baseEnv = process.env,
}) {
  const inheritedEnv = { ...baseEnv };
  return new Promise((resolve) => {
    let child;
    let watcher;
    let timer;
    let restarting = false;
    let stopping = false;
    let finished = false;

    const finish = (code) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      watcher?.close();
      process.stdin.pause();
      process.off('SIGINT', stop);
      process.off('SIGTERM', stop);
      resolve(code);
    };

    const stop = () => {
      stopping = true;
      restarting = false;
      clearTimeout(timer);
      watcher?.close();
      if (child) child.kill('SIGTERM');
      else finish(0);
    };

    const start = () => {
      watcher?.close();
      // Re-evaluate strict startup on every run, without mutating process.env.
      const env = loadStandaloneAppEnv({ rootDir, baseEnv: inheritedEnv });
      if (env.NOCOBASE_STRICT_STARTUP !== 'true') {
        watcher = watchConfigFiles(
          { directory: rootDir, filenames: new Set(['.env', '.env.local']) },
          (_event, filename) => {
            clearTimeout(timer);
            timer = setTimeout(() => {
              if (stopping || restarting) return;
              restarting = true;
              console.log(
                `[dev] ${filename} changed; restarting development processes`,
              );
              child.kill('SIGTERM');
            }, 100);
          },
        );
      }
      child = spawn(process.execPath, [...process.execArgv, entry], {
        cwd: rootDir,
        env: inheritedEnv,
        stdio: ['pipe', 'inherit', 'inherit'],
      });
      const running = child;
      process.stdin.pipe(running.stdin);
      // A terminal write racing shutdown must not crash the supervisor.
      running.stdin.on('error', (error) => {
        if (error.code !== 'EPIPE' && error.code !== 'ERR_STREAM_DESTROYED') {
          console.error('[dev] Failed to forward input', error);
        }
      });
      running.once('error', (error) => {
        console.error('[dev] Failed to start development processes', error);
        finish(1);
      });
      running.once('close', (code) => {
        process.stdin.unpipe(running.stdin);
        child = undefined;
        if (finished) return;
        if (stopping) return finish(0);
        if (!restarting) return finish(code ?? 1);
        restarting = false;
        clearTimeout(timer);
        try {
          start();
        } catch (error) {
          console.error('[dev] Failed to reload environment', error);
          finish(1);
        }
      });
    };

    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    try {
      start();
    } catch (error) {
      console.error('[dev] Failed to load environment', error);
      finish(1);
    }
  });
}
