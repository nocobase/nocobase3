import {
  type IResourceItem,
  useTranslate,
  useUserFriendlyName,
} from "@refinedev/core";

import {
  parseTranslationExpression,
  type TranslationOptions,
} from "@nocobase/portal-sdk/i18n";

export type ResourceLabelForm = "plural" | "singular";

type ResourceLabelMeta = {
  i18nKey?: string;
  i18nOptions?: TranslationOptions;
  i18nSingularKey?: string;
  label?: unknown;
  singularLabel?: unknown;
};

type Translate = ReturnType<typeof useTranslate>;
type UserFriendlyName = ReturnType<typeof useUserFriendlyName>;

function translateWithFallback(
  translate: Translate,
  key: string,
  fallback: string,
  options?: TranslationOptions
) {
  const translated = options
    ? translate(key, options, fallback)
    : translate(key, fallback);

  return !translated || translated === key ? fallback : translated;
}

function resolveExplicitLabel(value: unknown, translate: Translate) {
  if (typeof value !== "string") {
    return value == null ? undefined : String(value);
  }

  const expression = parseTranslationExpression(value);
  if (!expression) return value;

  const fallback = expression.options?.defaultValue ?? expression.key;
  return translateWithFallback(
    translate,
    expression.key,
    fallback,
    expression.options
  );
}

export function getResourceLabel(
  resource: IResourceItem | undefined,
  form: ResourceLabelForm,
  translate: Translate,
  getUserFriendlyName: UserFriendlyName,
  fallbackIdentifier?: string
) {
  const meta = resource?.meta as ResourceLabelMeta | undefined;
  const topLevelLabel = (
    resource as (IResourceItem & { label?: unknown }) | undefined
  )?.label;
  const explicitLabel =
    form === "singular"
      ? meta?.singularLabel ?? meta?.label ?? topLevelLabel
      : meta?.label ?? topLevelLabel;
  const fallback =
    resolveExplicitLabel(explicitLabel, translate) ??
    getUserFriendlyName(
      fallbackIdentifier ?? resource?.identifier ?? resource?.name ?? "",
      form
    );
  const i18nKey =
    form === "singular"
      ? meta?.i18nSingularKey ?? meta?.i18nKey
      : meta?.i18nKey;

  return i18nKey
    ? translateWithFallback(translate, i18nKey, fallback, meta?.i18nOptions)
    : fallback;
}

export function useResourceLabel(
  resource: IResourceItem | undefined,
  form: ResourceLabelForm,
  fallbackIdentifier?: string
) {
  const translate = useTranslate();
  const getUserFriendlyName = useUserFriendlyName();

  return getResourceLabel(
    resource,
    form,
    translate,
    getUserFriendlyName,
    fallbackIdentifier
  );
}
