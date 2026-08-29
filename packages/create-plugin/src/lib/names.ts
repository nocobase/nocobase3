export const PACKAGE_PREFIX = '@nocobase/app-plugin-';
export const DIRECTORY_PREFIX = 'app-plugin-';

const pluginNamePattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;

export interface PluginNames {
  readonly collectionName: string;
  readonly directoryName: string;
  readonly moduleName: string;
  readonly packageName: string;
  readonly shortName: string;
  readonly symbolName: string;
}

export function normalizePluginName(value: string | undefined): string {
  if (typeof value !== 'string') {
    throw new Error('A plugin name is required.');
  }

  let shortName = value.trim();
  if (shortName.startsWith(PACKAGE_PREFIX)) {
    shortName = shortName.slice(PACKAGE_PREFIX.length);
  } else if (shortName.startsWith(DIRECTORY_PREFIX)) {
    shortName = shortName.slice(DIRECTORY_PREFIX.length);
  }

  if (!pluginNamePattern.test(shortName)) {
    throw new Error(
      'Plugin name must start with a lowercase letter and contain only lowercase letters, numbers, and single hyphens.',
    );
  }

  return shortName;
}

export function toTitleCase(value: string): string {
  return value
    .split('-')
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ');
}

function toPascalCase(value: string): string {
  return value
    .split('-')
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join('');
}

export function createPluginNames(value: string): PluginNames {
  const shortName = normalizePluginName(value);
  const symbolName = toPascalCase(shortName);

  return {
    collectionName: `appPlugin${symbolName}Records`,
    directoryName: `${DIRECTORY_PREFIX}${shortName}`,
    moduleName: symbolName[0].toLowerCase() + symbolName.slice(1),
    packageName: `${PACKAGE_PREFIX}${shortName}`,
    shortName,
    symbolName,
  };
}
