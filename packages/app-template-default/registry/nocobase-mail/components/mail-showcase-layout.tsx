import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function MailShowcasePage({
  title,
  description,
  badge = "Interactive preview",
  children,
  className,
}: {
  title: string;
  description: string;
  badge?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-10 pb-12", className)}>
      <section className="flex flex-wrap items-start justify-between gap-5 border-b pb-8">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">Mail Components</Badge>
            <Badge variant="outline">{badge}</Badge>
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-[-0.035em]">
            {title}
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        </div>
      </section>
      {children}
    </div>
  );
}

export function MailShowcaseSection({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {eyebrow}
        </p>
        <h2 className="mt-2 text-xl font-semibold tracking-tight">{title}</h2>
        <p className="mt-1.5 max-w-3xl text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </div>
      {children}
    </section>
  );
}
