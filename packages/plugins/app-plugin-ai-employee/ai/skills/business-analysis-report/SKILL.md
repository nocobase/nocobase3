---
name: business-analysis-report
scope: GENERAL
description: Build a validated Markdown business report with optional inline charts from freshly queried, authorized data.
tools:
  - businessReportGenerator
  - getSkill
---

# Business analysis report

Use this skill when a user requests a business report or a substantial visual analysis. A concise data question does not require a report.

## Workflow

1. Clarify the business question, measures, audience, reporting period, and expected scope.
2. Load `getSkill` with `skillName: "data-query"`. When source or field metadata is unclear, follow that skill to load `data-metadata`. Query current data through the authorized tools before writing findings.
3. Check that every data query succeeded. Keep the source connection, collection, filters, reporting interval, and result limits available for the methodology section. If access is denied or coverage is incomplete, disclose the limitation; do not invent missing values.
4. Write a title, concise summary, and Markdown body separating observations from interpretation and recommendations. Include the data scope, date/time assumptions, and pagination or truncation caveats. Do not present a limited page as a whole-population result.
5. Build optional charts from the actual query results. Use the structured chart schema exposed by `businessReportGenerator`; never send stringified JSON, executable functions, arbitrary JavaScript, or guessed values. Keep exact values in the text when plotting would lose numeric precision.
6. Insert `{{chart:n}}` placeholders only for charts present in the submitted list, following the tool's documented indexing. A report without charts is valid and needs no placeholders. An export filename is optional and must follow the tool schema.
7. Call `businessReportGenerator`. Inspect its status, `chartCount`, `errors`, and `warnings`. A tool call being completed does not by itself mean a report was generated successfully.
8. If validation fails, correct the reported input errors and retry. Never claim success or describe rejected charts as rendered. On success, present the confirmed report and disclose any warnings that affect interpretation.

## Boundaries

The server validates chart structure and references, but cannot prove that an invented business claim is true. You are responsible for grounding narrative and chart values in successful queries. Skill instructions are not authorization controls; all data permissions and input limits are enforced separately by the server. Delegation does not change the trusted user's access. This tool provides the existing report preview/export interaction, not report persistence, scheduled delivery, or new storage capabilities.
