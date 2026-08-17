import type { Action, IResourceItem } from "@refinedev/core";
import { useParsed, useTranslate } from "@refinedev/core";
import { useLayoutEffect } from "react";
import { useLocation } from "react-router";
import { useResourceLabel } from "@/components/resources/resource-label";

export type ActionPrefixContext = {
  id?: string;
};

export type ActionPrefix = string | ((context: ActionPrefixContext) => string);

export type DocumentTitleContext = {
  action?: Action;
  appName: string;
  defaultTitle: string;
  id?: string;
  params?: Record<string, string | undefined>;
  pathname?: string;
  resource?: IResourceItem;
  resourceName?: string;
  separator: string;
};

export type DocumentTitleFormatter = (context: DocumentTitleContext) => string;

export type DocumentTitleHandlerProps = {
  actionPrefixes?: Partial<Record<Action, ActionPrefix>>;
  appName?: string;
  defaultTitle?: string;
  formatTitle?: DocumentTitleFormatter;
  separator?: string;
};

const defaultActionPrefixes = {
  clone: ({ id }: ActionPrefixContext) => `#${id ?? ""} Clone `,
  create: "Create new ",
  edit: ({ id }: ActionPrefixContext) => `#${id ?? ""} Edit `,
  list: "",
  show: ({ id }: ActionPrefixContext) => `#${id ?? ""} Show `,
} satisfies Partial<Record<Action, ActionPrefix>>;

const safeTranslate = (
  translate: ReturnType<typeof useTranslate>,
  key: string,
  defaultMessage?: string,
  options?: Record<string, unknown>
) => {
  const translated = options
    ? translate(key, options, defaultMessage)
    : translate(key, defaultMessage);

  const fallback = defaultMessage ?? key;

  if (translated === key || typeof translated === "undefined") {
    return fallback;
  }

  return translated;
};

const resolveActionPrefix = (
  actionPrefix: ActionPrefix | undefined,
  context: ActionPrefixContext
) => {
  if (typeof actionPrefix === "function") {
    return actionPrefix(context);
  }

  return actionPrefix ?? "";
};

export function DocumentTitleHandler({
  actionPrefixes,
  appName = "NocoBase",
  defaultTitle = appName,
  formatTitle,
  separator = " | ",
}: DocumentTitleHandlerProps) {
  const location = useLocation();
  const { action, id, params, pathname, resource } = useParsed();
  const translate = useTranslate();
  const identifier = resource?.identifier ?? resource?.name;
  const resourceNameFallback = useResourceLabel(
    resource,
    action === "list" ? "plural" : "singular",
    identifier
  );

  useLayoutEffect(() => {
    const resourceName = resource?.name
      ? safeTranslate(
          translate,
          `${resource.name}.${resource.name}`,
          resourceNameFallback
        )
      : resourceNameFallback;

    const context: DocumentTitleContext = {
      action,
      appName,
      defaultTitle,
      id: typeof id === "undefined" ? undefined : `${id}`,
      params,
      pathname,
      resource: resource
        ? {
            ...resource,
            meta: {
              ...resource.meta,
              label: resourceName,
            },
          }
        : undefined,
      resourceName,
      separator,
    };

    if (formatTitle) {
      document.title = formatTitle(context);
      return;
    }

    if (!action || !identifier || !resourceName) {
      document.title = defaultTitle;
      return;
    }

    const mergedActionPrefixes = {
      ...defaultActionPrefixes,
      ...actionPrefixes,
    };
    const prefix = resolveActionPrefix(mergedActionPrefixes[action], context);
    const fallbackTitle = `${prefix}${resourceName}${separator}${appName}`;

    document.title = safeTranslate(
      translate,
      `documentTitle.${identifier}.${action}`,
      fallbackTitle,
      { id: context.id }
    );
  }, [
    action,
    actionPrefixes,
    appName,
    defaultTitle,
    formatTitle,
    id,
    identifier,
    location,
    params,
    pathname,
    resource,
    resourceNameFallback,
    separator,
    translate,
  ]);

  return null;
}
