"use client";

import type { PropsWithChildren } from "react";

import { ArrowLeftIcon } from "lucide-react";
import { useBack, useResourceParams, useTranslate } from "@refinedev/core";
import { Breadcrumb } from "@/components/app-shell/breadcrumb";
import { Button } from "@/components/ui/button";
import { RefreshButton } from "@/components/resources/buttons/refresh";
import { cn } from "@/lib/utils";
import { EditButton } from "../buttons/edit";
import { useResourceLabel } from "@/components/resources/resource-label";

type ShowViewProps = PropsWithChildren<{
  className?: string;
  resource?: string;
  title?: string;
}>;

export function ShowView({
  children,
  className,
  resource,
  title,
}: ShowViewProps) {
  return (
    <div className={cn("flex flex-col", "gap-6", className)}>
      <ShowViewHeader resource={resource} title={title} />
      {children}
    </div>
  );
}

type ShowViewHeaderProps = PropsWithChildren<{
  resource?: string;
  title?: string;
  wrapperClassName?: string;
  headerClassName?: string;
}>;

export const ShowViewHeader = ({
  resource: resourceFromProps,
  title: titleFromProps,
  wrapperClassName,
  headerClassName,
}: ShowViewHeaderProps) => {
  const back = useBack();
  const translate = useTranslate();

  const { resource, identifier } = useResourceParams({
    resource: resourceFromProps,
  });
  const { id: recordItemId } = useResourceParams();

  const resourceName = resource?.name ?? identifier;

  const resourceTitle = useResourceLabel(resource, "singular", identifier);
  const title = titleFromProps ?? resourceTitle;
  const description = translate(
    "views.show.description",
    "Review the record and its NocoBase-managed data."
  );

  return (
    <div className={cn("flex flex-col", "gap-3", wrapperClassName)}>
      <div className="flex items-center text-muted-foreground">
        <Breadcrumb />
      </div>
      <div
        className={cn(
          "flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between",
          headerClassName
        )}
      >
        <div className="flex items-start gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="mt-0.5 rounded-lg"
            onClick={back}
            aria-label={translate("buttons.cancel", "Cancel")}
          >
            <ArrowLeftIcon className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="text-3xl font-semibold tracking-[-0.035em]">
              {title}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">{description}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <RefreshButton
            variant="outline"
            recordItemId={recordItemId}
            resource={resourceName}
          />
          <EditButton
            variant="outline"
            recordItemId={recordItemId}
            resource={resourceName}
          />
        </div>
      </div>
    </div>
  );
};

ShowView.displayName = "ShowView";
