import { LoadingState } from "@/components/app-shell/loading-state";
import { NocoBaseErrorBoundary } from "@/extensions/nocobase-error-boundary";
import { LoaderCircle } from "lucide-react";
import { lazy, Suspense } from "react";
import type { AIToolRendererProps } from "./tool-renderer-provider";
import { asRecord } from "./tool-renderer-utils";
import { useAITranslate } from "../../locales/use-ai-translate";

const EChartsPreview = lazy(() => import("./echarts-preview"));

export function ChartPreview({
  options,
}: {
  options: Record<string, unknown>;
}) {
  return (
    <Suspense fallback={<LoadingState className="h-[280px]" />}>
      <EChartsPreview options={options} />
    </Suspense>
  );
}

export function ChartRenderer({ part }: AIToolRendererProps) {
  const t = useAITranslate();
  const input = asRecord(part.input);
  const options = asRecord(input.options);
  if (!Object.keys(options).length) {
    return (
      <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" />
        {t("tool.chart.generating", "Generating chart…")}
      </div>
    );
  }
  return (
    <NocoBaseErrorBoundary variant="region" resetKeys={[part.input]}>
      <div className="rounded-lg border bg-background p-3">
        <ChartPreview options={options} />
      </div>
    </NocoBaseErrorBoundary>
  );
}
