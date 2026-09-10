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
