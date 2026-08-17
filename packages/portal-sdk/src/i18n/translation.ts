export type TranslationOptions = Record<string, unknown> & {
  defaultValue?: string;
  ns?: string | string[];
};

export type TranslationResolver = (
  key: string,
  options?: TranslationOptions,
  defaultMessage?: string
) => string;

export type TranslationExpression = {
  key: string;
  options?: TranslationOptions;
};

export type TranslationResource = Record<string, string | number | boolean>;

export type TranslationResourceBundle = Record<string, TranslationResource>;

type TranslationResourceListener = (
  namespace: string,
  resources: TranslationResourceBundle
) => void;

let translationResolver: TranslationResolver | undefined;
const translationResources = new Map<string, TranslationResourceBundle>();
const translationResourceListeners = new Set<TranslationResourceListener>();

const quotedValuePattern = `(?:"(?:\\\\.|[^"\\\\])*"|'(?:\\\\.|[^'\\\\])*')`;
const translationExpressionPattern = new RegExp(
  `^\\s*\\{\\{\\s*t\\(\\s*(${quotedValuePattern})\\s*(?:,\\s*(\\{[\\s\\S]*\\}))?\\s*\\)\\s*\\}\\}\\s*$`
);

function decodeQuotedValue(value: string) {
  if (value.startsWith('"')) {
    try {
      return JSON.parse(value) as string;
    } catch {
      return value.slice(1, -1);
    }
  }

  return value
    .slice(1, -1)
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\\/g, "\\");
}

function parsePrimitive(value: string): unknown {
  const normalized = value.trim();
  if (normalized.startsWith('"') || normalized.startsWith("'")) {
    return decodeQuotedValue(normalized);
  }
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  if (normalized === "null") return null;
  if (/^-?\d+(?:\.\d+)?$/.test(normalized)) return Number(normalized);
  return undefined;
}

function parseOptions(source?: string): TranslationOptions | undefined {
  if (!source) return undefined;

  const options: TranslationOptions = {};
  const propertyPattern = new RegExp(
    `([A-Za-z_$][\\w$]*)\\s*:\\s*(${quotedValuePattern}|-?\\d+(?:\\.\\d+)?|true|false|null)`,
    "g"
  );

  for (const match of source.matchAll(propertyPattern)) {
    const value = parsePrimitive(match[2]);
    if (typeof value !== "undefined") options[match[1]] = value;
  }

  const namespaceArray = source.match(/\bns\s*:\s*\[([^\]]*)\]/);
  if (namespaceArray) {
    const namespaces = [
      ...namespaceArray[1].matchAll(new RegExp(quotedValuePattern, "g")),
    ].map((match) => decodeQuotedValue(match[0]));
    if (namespaces.length) options.ns = namespaces;
  }

  return Object.keys(options).length ? options : undefined;
}

export function parseTranslationExpression(
  value: string
): TranslationExpression | undefined {
  const match = translationExpressionPattern.exec(value);
  if (!match) return undefined;

  return {
    key: decodeQuotedValue(match[1]),
    options: parseOptions(match[2]),
  };
}

export function setTranslationResolver(resolver?: TranslationResolver) {
  translationResolver = resolver;
  return () => {
    if (translationResolver === resolver) translationResolver = undefined;
  };
}

export function registerTranslationResources(
  namespace: string,
  resources: TranslationResourceBundle
) {
  const current = translationResources.get(namespace) ?? {};
  const merged = Object.fromEntries(
    [...new Set([...Object.keys(current), ...Object.keys(resources)])].map(
      (locale) => [
        locale,
        {
          ...(current[locale] ?? {}),
          ...(resources[locale] ?? {}),
        },
      ]
    )
  );

  translationResources.set(namespace, merged);
  translationResourceListeners.forEach((listener) =>
    listener(namespace, resources)
  );
}

export function getTranslationResources() {
  return [...translationResources.entries()];
}

export function subscribeTranslationResources(
  listener: TranslationResourceListener
) {
  translationResourceListeners.add(listener);
  return () => translationResourceListeners.delete(listener);
}

export function resolveTranslatableText(
  value: unknown,
  options?: TranslationOptions
): string {
  if (typeof value !== "string") return value == null ? "" : String(value);

  const expression = parseTranslationExpression(value);
  if (!expression) {
    return translationResolver && options
      ? translationResolver(value, options, value)
      : value;
  }

  const defaultMessage = expression.options?.defaultValue ?? expression.key;
  return translationResolver
    ? translationResolver(expression.key, expression.options, defaultMessage)
    : defaultMessage;
}
