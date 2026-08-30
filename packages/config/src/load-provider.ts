import { ConfigParserError, ConfigProviderError } from './errors.js';
import type {
  ConfigMap,
  ConfigParser,
  ConfigProvider,
  ConfigProviderMetadata,
} from './types.js';
import { assertConfigMap, cloneConfigValue } from './value.js';

export interface LoadedConfigProvider {
  readonly value: ConfigMap;
  readonly metadata?: ConfigProviderMetadata;
}

export async function loadConfigProvider(
  provider: ConfigProvider,
  parser: ConfigParser | undefined,
  signal: AbortSignal,
): Promise<LoadedConfigProvider> {
  let result;
  try {
    result = await provider.read({ signal });
  } catch (error) {
    throw new ConfigProviderError(
      provider.name,
      error instanceof Error ? error.message : String(error),
      { cause: error },
    );
  }

  if (result.kind === 'map') {
    if (parser) {
      throw new ConfigParserError(
        parser.name,
        provider.name,
        'a parser cannot be used with a map provider',
      );
    }
    return {
      value: cloneConfigValue(assertConfigMap(result.value)),
      metadata: result.metadata,
    };
  }

  if (!parser) {
    throw new ConfigProviderError(
      provider.name,
      'a parser is required for a bytes provider',
    );
  }

  try {
    return {
      value: cloneConfigValue(assertConfigMap(parser.parse(result.value))),
      metadata: result.metadata,
    };
  } catch (error) {
    if (error instanceof ConfigParserError) throw error;
    throw new ConfigParserError(
      parser.name,
      provider.name,
      error instanceof Error ? error.message : String(error),
      { cause: error },
    );
  }
}
