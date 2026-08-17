"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { LoadingState } from "@/components/app-shell/loading-state";

interface LoadingOverlayProps extends React.HTMLAttributes<HTMLDivElement> {
  loading?: boolean;
  children: React.ReactNode;
}

export const LoadingOverlay = React.forwardRef<
  HTMLDivElement,
  LoadingOverlayProps
>(({ className, loading = false, children, ...props }, ref) => {
  if (!loading) return children;

  return (
    <div className="relative" ref={ref} {...props}>
      {children}
      <div
        className={cn(
          "absolute inset-0 z-50 flex items-center justify-center",
          "bg-background/60",
          className
        )}
      >
        <LoadingState />
      </div>
    </div>
  );
});

LoadingOverlay.displayName = "LoadingOverlay";
