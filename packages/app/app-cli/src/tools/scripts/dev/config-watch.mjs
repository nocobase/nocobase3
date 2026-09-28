import fs from 'node:fs';
import path from 'node:path';

export function resolveConfigWatch(rootDir, configuredPath) {
  const configPath = path.resolve(rootDir, configuredPath ?? 'config');
  const extension = path.extname(configPath);
  const filenames = extension
    ? [path.basename(configPath)]
    : ['.yml', '.yaml', '.toml', '.json'].map((candidateExtension) =>
        path.basename(`${configPath}${candidateExtension}`),
      );

  return {
    directory: path.dirname(configPath),
    filenames: new Set(filenames),
  };
}

// There are at most four config files. Stat polling also handles atomic saves
// and missing files without consuming native directory watchers.
export function watchConfigFiles(config, onChange) {
  const listeners = [...config.filenames].map((filename) => {
    const file = path.join(config.directory, filename);
    const listener = (current, previous) => {
      if (
        current.mtimeMs !== previous.mtimeMs ||
        current.ino !== previous.ino
      ) {
        onChange('change', filename);
      }
    };
    fs.watchFile(file, { interval: 300 }, listener);
    return { file, listener };
  });
  return {
    close() {
      for (const { file, listener } of listeners)
        fs.unwatchFile(file, listener);
    },
  };
}
