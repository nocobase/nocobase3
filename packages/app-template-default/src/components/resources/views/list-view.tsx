"use client";

import type { PropsWithChildren } from "react";

import { useResourceParams, useTranslate } from "@refinedev/core";
import { Breadcrumb } from "@/components/app-shell/breadcrumb";
import { CreateButton } from "@/components/resources/buttons/create";
import { useResourceLabel } from "@/components/resources/resource-label";
import {
  resolveTranslatableText,
  type TranslationOptions,
} from "@nocobase/portal-sdk/i18n";
import { cn } from "@/lib/utils";

type ListViewProps = PropsWithChildren<{
  className?: string;
  resource?: string;
}>;

export function ListView({ children, className, resource }: ListViewProps) {
  return (
    <div className={cn("flex flex-col", "gap-6", className)}>
      <ListViewHeader resource={resource} />
      {children}
    </div>
  );
}

type ListHeaderProps = PropsWithChildren<{
  resource?: string;
  title?: string;
  canCreate?: boolean;
  headerClassName?: string;
  wrapperClassName?: string;
}>;

export const ListViewHeader = ({
  canCreate,
  resource: resourceFromProps,
  title: titleFromProps,
  wrapperClassName,
  headerClassName,
}: ListHeaderProps) => {
  const { resource, identifier } = useResourceParams({
    resource: resourceFromProps,
  });
  const translate = useTranslate();
  const resourceName = identifier ?? resource?.name;

  const isCreateButtonVisible = canCreate ?? !!resource?.create;

  const resourceTitle = useResourceLabel(resource, "plural", identifier);
  const title = titleFromProps ?? resourceTitle;
  const meta = resource?.meta as
    | {
        description?: string;
        descriptionI18nKey?: string;
        i18nOptions?: TranslationOptions;
      }
    | undefined;
  const description = meta?.descriptionI18nKey
    ? translate(
        meta.descriptionI18nKey,
        meta.i18nOptions,
        meta.description ?? meta.descriptionI18nKey
      )
    : resolveTranslatableText(meta?.description);

  return (
    <div className={cn("flex flex-col", "gap-3", wrapperClassName)}>
      <div className="flex items-center text-muted-foreground">
        <Breadcrumb />
      </div>
      <div
        className={cn(
          "flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between",
          headerClassName
        )}
      >
        <div>
          <h2 className="text-3xl font-semibold tracking-[-0.035em]">
            {title}
          </h2>
          {description && (
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {isCreateButtonVisible && (
          <div className="flex items-center gap-2">
            <CreateButton resource={resourceName} />
          </div>
        )}
      </div>
    </div>
  );
};

ListView.displayName = "ListView";
