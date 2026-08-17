import type { MailLabel } from "./types";
import { LABEL_BADGE_CLASSES } from "./types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function MailLabelBadge({
  label,
  className,
}: {
  label: MailLabel;
  className?: string;
}) {
  return (
    <Badge
      variant="secondary"
      className={cn(
        "h-5 rounded-md px-1.5 text-[10px] font-medium shadow-none",
        LABEL_BADGE_CLASSES[label.color] ?? LABEL_BADGE_CLASSES.default,
        className
      )}
    >
      {label.label}
    </Badge>
  );
}
