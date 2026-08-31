import type {
  SpaClientConfigMap,
  SpaRuntimeGlobalValue,
  SpaRuntimeGlobals,
} from './types.js';

export interface NocoBaseSpaRuntimeConfig {
  readonly appBasePath: string;
  readonly apiUrl: string;
  readonly storagePrefix?: string;
  readonly storageType?: string;
  readonly shareToken?: boolean;
}

export function createNocoBaseSpaRuntimeGlobals(
  config: NocoBaseSpaRuntimeConfig,
): SpaRuntimeGlobals {
  return {
    NOCOBASE_PORTAL_BASE: toBrowserBasePath(config.appBasePath),
    NOCOBASE_API_URL: config.apiUrl,
    __nocobase_api_client_storage_prefix__:
      config.storagePrefix?.trim() || 'NOCOBASE_',
    __nocobase_api_client_storage_type__:
      config.storageType?.trim() || 'localStorage',
    __nocobase_api_client_share_token__: config.shareToken ?? false,
  };
}

const runtimeGlobalsStartMarker = '<!-- nocobase-spa-runtime:start -->';
const runtimeGlobalsEndMarker = '<!-- nocobase-spa-runtime:end -->';
const runtimeConfigElementId = 'nocobase-runtime-config';

export function injectSpaRuntimeGlobals(
  html: string,
  runtimeGlobals: SpaRuntimeGlobals = {},
): string {
  const cleanHtml = stripExistingRuntimeGlobals(html);
  const runtimeGlobalsHtml = createSpaRuntimeGlobalsHtml(runtimeGlobals);
  if (!runtimeGlobalsHtml) {
    return cleanHtml;
  }

  const moduleScriptPattern = /<script\s+[^>]*type=["']module["'][^>]*>/i;
  const moduleScriptMatch = cleanHtml.match(moduleScriptPattern);
  if (moduleScriptMatch?.index === undefined) {
    return `${cleanHtml}\n${runtimeGlobalsHtml}`;
  }

  return `${cleanHtml.slice(0, moduleScriptMatch.index)}${runtimeGlobalsHtml}${cleanHtml.slice(moduleScriptMatch.index)}`;
}

export function injectSpaRuntimeHtml(
  html: string,
  options: {
    readonly clientConfig?: SpaClientConfigMap;
    readonly runtimeGlobals?: SpaRuntimeGlobals;
  } = {},
): string {
  const withGlobals = injectSpaRuntimeGlobals(html, options.runtimeGlobals);
  const cleanHtml = stripExistingRuntimeConfig(withGlobals);
  const configHtml = createSpaRuntimeConfigHtml(options.clientConfig ?? {});
  const moduleScriptPattern = /<script\s+[^>]*type=["']module["'][^>]*>/i;
  const moduleScriptMatch = cleanHtml.match(moduleScriptPattern);
  if (moduleScriptMatch?.index === undefined) {
    return `${cleanHtml}\n${configHtml}`;
  }
  return `${cleanHtml.slice(0, moduleScriptMatch.index)}${configHtml}${cleanHtml.slice(moduleScriptMatch.index)}`;
}

function stripExistingRuntimeGlobals(html: string): string {
  const pattern = new RegExp(
    `${runtimeGlobalsStartMarker}[\\s\\S]*?${runtimeGlobalsEndMarker}\\s*`,
    'g',
  );
  return html.replace(pattern, '');
}

function createSpaRuntimeGlobalsHtml(
  runtimeGlobals: SpaRuntimeGlobals,
): string {
  const assignments = Object.entries(runtimeGlobals)
    .filter(
      (entry): entry is [string, SpaRuntimeGlobalValue] =>
        entry[1] !== undefined,
    )
    .map(
      ([key, value]) =>
        `  ${windowGlobalExpression(key)} = ${serializeRuntimeGlobalValue(value)};`,
    );

  if (assignments.length === 0) {
    return '';
  }

  return `${runtimeGlobalsStartMarker}
<script>
${assignments.join('\n')}
</script>
${runtimeGlobalsEndMarker}
`;
}

function windowGlobalExpression(key: string): string {
  if (/^[A-Za-z_$][\w$]*$/.test(key)) {
    return `window.${key}`;
  }

  const serializedKey = JSON.stringify(key);
  return `window[${escapeScriptJson(serializedKey)}]`;
}

function serializeRuntimeGlobalValue(value: SpaRuntimeGlobalValue): string {
  const serializedValue = JSON.stringify(value);
  if (serializedValue === undefined) {
    throw new Error('SPA runtime global values must be JSON-serializable.');
  }

  return escapeScriptJson(serializedValue);
}

export function escapeScriptJson(value: string): string {
  return value
    .replace(/</g, '\\u003C')
    .replace(/>/g, '\\u003E')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function stripExistingRuntimeConfig(html: string): string {
  const pattern = new RegExp(
    `<script\\s+[^>]*id=["']${runtimeConfigElementId}["'][^>]*>[\\s\\S]*?<\\/script>\\s*`,
    'gi',
  );
  return html.replace(pattern, '');
}

function createSpaRuntimeConfigHtml(config: SpaClientConfigMap): string {
  return `<script id="${runtimeConfigElementId}" type="application/json">${escapeScriptJson(
    JSON.stringify({ version: 1, config }),
  )}</script>\n`;
}

function toBrowserBasePath(value: string): string {
  return value ? `${value.replace(/\/+$/, '')}/` : '/';
}
