import { describe, expect, it } from "vitest";

import {
  buildBusinessReportMarkdown,
  renderBusinessReportMarkdownToHtml,
  splitBusinessReportMarkdown,
} from "../components/tools/business-report-utils";

describe("AI business reports", () => {
  it("preserves markdown sections around embedded charts", async () => {
    const markdown = buildBusinessReportMarkdown({
      title: "Quarterly report",
      summary: "A complete report summary.",
      markdown: `## KPI overview

| Metric | Value |
| --- | ---: |
| Revenue | 1286 |

{{chart:1}}

## Recommendations

Keep the final section in the exported HTML.`,
      charts: [
        {
          title: "Trend",
          options: { series: [{ type: "line", data: [1, 2] }] },
        },
      ],
    });

    const parts = splitBusinessReportMarkdown(markdown);
    expect(parts.map((part) => part.type)).toEqual([
      "markdown",
      "chart",
      "markdown",
    ]);
    const first = parts[0];
    const last = parts[2];
    if (first.type !== "markdown" || last.type !== "markdown") {
      throw new Error("Expected markdown around the embedded chart");
    }
    expect(first.content).toMatch(/Quarterly report/);
    expect(last.content).toMatch(/Recommendations/);

    const html = await renderBusinessReportMarkdownToHtml(first.content);
    expect(html).toMatch(/<h1>Quarterly report<\/h1>/);
    expect(html).toMatch(/<table>/);
    expect(html).toMatch(/Revenue/);
  });
});
