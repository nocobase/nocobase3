import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type StatusBadgeProps = {
  status?: string | null;
  className?: string;
};

const dotStyles: Record<string, string> = {
  published: "bg-foreground",
  draft: "bg-neutral-400 dark:bg-neutral-500",
  rejected: "border border-current bg-transparent",
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const normalizedStatus = status?.toLowerCase() || "unknown";

  return (
    <Badge
      variant="outline"
      className={cn(
        "h-6 gap-1.5 rounded-md border-border/80 bg-card px-2 text-[11px] font-medium capitalize text-foreground shadow-none",
        normalizedStatus === "rejected" && "text-muted-foreground",
        className
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 rounded-full",
          dotStyles[normalizedStatus] ?? "bg-muted-foreground"
        )}
      />
      {normalizedStatus}
    </Badge>
  );
}
