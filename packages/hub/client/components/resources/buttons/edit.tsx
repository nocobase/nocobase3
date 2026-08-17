"use client";

import React from "react";
import { type BaseKey, useEditButton } from "@refinedev/core";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";

type EditButtonProps = {
  /**
   * Resource name for API data interactions. `identifier` of the resource can be used instead of the `name` of the resource.
   * @default Inferred resource name from the route
   */
  resource?: string;
  /**
   * Data item identifier for the actions with the API
   * @default Reads `:id` from the URL
   */
  recordItemId?: BaseKey;
  /**
   * Access Control configuration for the button
   * @default `{ enabled: true, hideIfUnauthorized: false }`
   */
  accessControl?: {
    enabled?: boolean;
    hideIfUnauthorized?: boolean;
  };
  /**
   * `meta` property is used when creating the URL for the related action and path.
   */
  meta?: Record<string, unknown>;
} & React.ComponentProps<typeof Button>;

export const EditButton = React.forwardRef<
  React.ComponentRef<typeof Button>,
  EditButtonProps
>(
  (
    { resource, recordItemId, accessControl, meta, children, onClick, ...rest },
    ref
  ) => {
    const { hidden, disabled, LinkComponent, to, label } = useEditButton({
      resource,
      id: recordItemId,
      accessControl,
      meta,
    });

    const isDisabled = disabled || rest.disabled;
    const isHidden = hidden || rest.hidden;

    if (isHidden) return null;

    return (
      <Button
        {...rest}
        ref={ref}
        disabled={isDisabled}
        render={<LinkComponent to={to} replace={false} />}
        onClick={(event) => {
          if (isDisabled) {
            event.preventDefault();
            return;
          }
          if (onClick) {
            event.preventDefault();
            onClick(event);
          }
        }}
      >
        {children ?? (
          <div className="flex items-center gap-2 font-semibold">
            <Pencil className="h-4 w-4" />
            <span>{label}</span>
          </div>
        )}
      </Button>
    );
  }
);

EditButton.displayName = "EditButton";
