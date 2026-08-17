import type { PropsWithChildren, ReactNode } from "react";
import { Blocks, ShieldCheck, Sparkles } from "lucide-react";

import { Brand } from "@/components/app-shell/brand";

type AuthLayoutProps = PropsWithChildren<{
  title: string;
  description: string;
  footer?: ReactNode;
}>;

export function AuthLayout({
  title,
  description,
  footer,
  children,
}: AuthLayoutProps) {
  return (
    <div className="grid min-h-svh md:grid-cols-[minmax(420px,44%)_1fr]">
      <main className="grid place-items-center bg-card px-6 py-10 sm:px-12">
        <div className="w-full max-w-sm">
          <Brand className="mb-14" logoClassName="h-10" />
          <h1 className="text-3xl font-semibold tracking-[-0.035em]">
            {title}
          </h1>
          <p className="mb-8 mt-2 text-sm text-muted-foreground">
            {description}
          </p>
          {children}
          {footer && <div className="mt-8 text-sm">{footer}</div>}
        </div>
      </main>

      <section className="relative hidden overflow-hidden bg-neutral-950 p-12 text-white md:grid md:place-items-center">
        <div className="absolute inset-0 opacity-[0.08] [background-image:linear-gradient(currentColor_1px,transparent_1px),linear-gradient(90deg,currentColor_1px,transparent_1px)] [background-size:48px_48px]" />
        <div className="relative w-full max-w-xl">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-foreground/60">
            AI-native application platform
          </div>
          <h2 className="mt-3 max-w-lg text-5xl font-semibold leading-[1.08] tracking-[-0.04em]">
            Let AI build freely. NocoBase keeps it reliable.
          </h2>
          <p className="mt-5 max-w-lg text-base leading-7 text-white/60">
            Give AI a flexible frontend framework to shape each experience,
            while NocoBase secures the data, permissions, workflows and
            governance underneath.
          </p>

          <div className="mt-10 max-w-md rounded-xl border border-white/15 bg-white p-5 text-neutral-900 shadow-2xl shadow-black/20">
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-lg bg-neutral-100">
                <Sparkles className="size-4" />
              </div>
              <div>
                <div className="font-semibold">AI-native frontend</div>
                <div className="text-sm text-neutral-500">
                  Compose interfaces freely on a flexible framework.
                </div>
              </div>
            </div>
            <div className="my-5 h-px bg-neutral-200" />
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-lg bg-neutral-100">
                <ShieldCheck className="size-4" />
              </div>
              <div>
                <div className="font-semibold">NocoBase foundation</div>
                <div className="text-sm text-neutral-500">
                  Reliable data, access control, workflows and governance.
                </div>
              </div>
            </div>
            <div className="mt-5 flex items-center gap-2 rounded-lg bg-neutral-100 px-3 py-2 text-xs font-medium text-neutral-600">
              <Blocks className="size-3.5" />
              Freedom above. Confidence below.
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
