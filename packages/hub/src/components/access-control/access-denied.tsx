import { ShieldX } from "lucide-react";

import { cn } from "@/lib/utils";

export function AccessDenied({
  className,
  title = "Access denied",
  description = "You don't have permission to view this content.",
}: {
  className?: string;
  title?: string;
  description?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed bg-background/70 p-8 text-center",
        className
      )}
    >
      <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-muted">
        <ShieldX className="size-6 text-muted-foreground" />
      </div>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
        {description}
      </p>
    </div>
  );
}
