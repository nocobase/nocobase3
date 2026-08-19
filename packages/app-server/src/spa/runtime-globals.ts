import type { SpaRuntimeGlobalValue, SpaRuntimeGlobals } from './types.js';

const runtimeGlobalsStartMarker = '<!-- nocobase-spa-runtime:start -->';
const runtimeGlobalsEndMarker = '<!-- nocobase-spa-runtime:end -->';

export function injectSpaRuntimeGlobals(html: string, runtimeGlobals: SpaRuntimeGlobals = {}): string {
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

function stripExistingRuntimeGlobals(html: string): string {
  const pattern = new RegExp(`${runtimeGlobalsStartMarker}[\\s\\S]*?${runtimeGlobalsEndMarker}\\s*`, 'g');
  return html.replace(pattern, '');
}

function createSpaRuntimeGlobalsHtml(runtimeGlobals: SpaRuntimeGlobals): string {
  const assignments = Object.entries(runtimeGlobals)
    .filter((entry): entry is [string, SpaRuntimeGlobalValue] => entry[1] !== undefined)
    .map(([key, value]) => `  ${windowGlobalExpression(key)} = ${serializeRuntimeGlobalValue(value)};`);

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

function escapeScriptJson(value: string): string {
  return value
    .replace(/</g, '\\u003C')
    .replace(/>/g, '\\u003E')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
