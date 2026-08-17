"use client";

import { cn } from "@/lib/utils";
import { useBack, useResourceParams, useTranslate } from "@refinedev/core";
import type { PropsWithChildren } from "react";
import { Breadcrumb } from "@/components/app-shell/breadcrumb";
import { Button } from "@/components/ui/button";
import { ArrowLeftIcon } from "lucide-react";
import { useResourceLabel } from "@/components/resources/resource-label";

type CreateViewProps = PropsWithChildren<{
  className?: string;
}>;

export function CreateView({ children, className }: CreateViewProps) {
  return (
    <div className={cn("flex flex-col", "gap-6", className)}>
      <CreateViewHeader />
      {children}
    </div>
  );
}

type CreateHeaderProps = PropsWithChildren<{
  resource?: string;
  title?: string;
  wrapperClassName?: string;
  headerClassName?: string;
}>;

export const CreateViewHeader = ({
  resource: resourceFromProps,
  title: titleFromProps,
  wrapperClassName,
  headerClassName,
}: CreateHeaderProps) => {
  const back = useBack();
  const translate = useTranslate();

  const { resource, identifier } = useResourceParams({
    resource: resourceFromProps,
  });

  const resourceTitle = useResourceLabel(resource, "singular", identifier);
  const title =
    titleFromProps ??
    translate(
      "views.create.title",
      { resource: resourceTitle },
      `Create ${resourceTitle}`
    );
  const description = translate(
    "views.create.description",
    { resource: resourceTitle.toLocaleLowerCase() },
    `Add a new ${resourceTitle.toLocaleLowerCase()} to your NocoBase workspace.`
  );

  return (
    <div className={cn("flex flex-col", "gap-3", wrapperClassName)}>
      <div className="flex items-center text-muted-foreground">
        <Breadcrumb />
      </div>
      <div className={cn("flex items-start gap-2", headerClassName)}>
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
    </div>
  );
};

CreateView.displayName = "CreateView";
