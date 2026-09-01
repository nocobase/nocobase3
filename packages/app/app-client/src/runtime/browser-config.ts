const RUNTIME_CONFIG_ELEMENT_ID = 'nocobase-runtime-config';
const RUNTIME_CONFIG_VERSION = 1;

export interface AppClientRuntimeConfigPayload {
  readonly version: 1;
  readonly config: unknown;
}

export function readAppClientRuntimeConfig(
  document: Document | undefined = globalThis.document,
): unknown {
  if (!document) {
    return {};
  }
  const element = document.getElementById(RUNTIME_CONFIG_ELEMENT_ID);
  if (!element) {
    return {};
  }
  const source = element.textContent?.trim();
  if (!source) {
    throw new Error('Client runtime config data block is empty.');
  }

  let payload: unknown;
  try {
    payload = JSON.parse(source) as unknown;
  } catch (error) {
    throw new Error('Client runtime config data block contains invalid JSON.', {
      cause: error,
    });
  }
  if (!isRuntimeConfigPayload(payload)) {
    throw new Error(
      `Client runtime config data block must use version ${RUNTIME_CONFIG_VERSION} and contain a config object.`,
    );
  }
  return payload.config;
}

function isRuntimeConfigPayload(
  value: unknown,
): value is AppClientRuntimeConfigPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    'version' in value &&
    value.version === RUNTIME_CONFIG_VERSION &&
    'config' in value &&
    typeof value.config === 'object' &&
    value.config !== null &&
    !Array.isArray(value.config)
  );
}
