---
name: data-query
i18n:
  namespace: '@nocobase/app-plugin-ai-employee'
introduction:
  title: Data query
scope: GENERAL
description: Query current authorized business records, counts, aggregates, and grouped summaries using bounded NocoBase 3 Repository queries.
tools:
  - dataSourceQuery
  - dataSourceCounting
  - dataQuery
---

# Data query

Use this skill for factual questions about current business data. Load `getSkill` with `skillName: "data-metadata"` first when the connection, collection, fields, or relationship semantics are not already known. Resolve ambiguous business terms with the user before choosing a collection or measure.

## Workflow

1. Confirm the authorized connection and collection, relevant fields, desired date interval, and business meaning of the requested measure.
2. Choose the smallest query that answers the question: `dataSourceQuery` for selected detail fields and bounded pages; `dataSourceCounting` for a count; `dataQuery` for server-side aggregation or grouping.
3. Follow the tool schema exactly. Do not send SQL, expressions, raw Repository ASTs, legacy measures/dimensions, or user/role overrides. Unsupported queries must be explained, not silently simulated by downloading the whole collection.
4. For date filters, use explicit instants with timezone offsets where appropriate. Clarify ambiguous local dates and use an inclusive start and exclusive end for calendar ranges. Do not assume legacy frontend relative-date operators are supported.
5. Read the actual tool result before answering. An empty result, a denied query, and a query failure are distinct outcomes. Never fabricate values or turn a failure into a zero count.
6. For questions about current data, run a fresh query rather than presenting a previous conversation result as current. State the data scope, filters, time interval, and any pagination or truncation limits that affect the conclusion.

## Supported query shape

Use `dataSource` (default `main`), `collection`, explicit `fields`, and filters such as `[{ "field": "createdAt", "operator": "dateNotBefore", "value": "2026-01-01T00:00:00Z" }]`. Filters are a bounded flat AND, not Repository ASTs. Sort uses `[{ "field": "id", "direction": "asc" }]`; use a unique sort for stable pagination. Pages have at most 100 root rows; included child relations are separately capped and do not report child `hasMore`.

Aggregates use `aggregates: [{ "function": "count", "alias": "count" }]`. Grouping must specify known value domains, for example `groupBy: [{ "field": "region", "values": ["north", "south"] }]`, with at most 100 possible combinations. Those domains filter the result: never claim they cover unknown regions. Unrestricted group discovery, date buckets, HAVING, through relations, and recursive relation queries are unsupported.

The execution timezone comes from trusted conversation context and is reported with results. Do not override it in tool arguments or assume automatic local-calendar conversion. `dateOn` applies to calendar-date fields, not timestamps. Timestamp ranges use explicit boundaries; timezone-bearing fields accept ISO instants with offsets, including the correct offset on each side of a daylight-saving transition. If a timezone or expression is unsupported, report the limitation instead of changing the question's semantics.

## Precision and permissions

Big integer IDs and decimal values may be returned as strings to preserve precision. Do not round identifiers or convert exact decimal strings to JavaScript numbers. Counts and aggregates follow the same authorized record scope as details; a count is not a way to bypass restricted records or fields. Relationship access is separately constrained; only use relationship selections explicitly supported by the tool schema.

Authorization uses the trusted conversation user, including delegated employee tasks. Neither skill activation nor employee delegation grants additional data access. The server checks query boundaries and permissions independently of this document.

## Presentation

Answer a simple data question directly. Do not force a report for every query. When the user requests a business report or a substantial visual analysis, load `getSkill` with `skillName: "business-analysis-report"` and base it only on successful query results. Disclose incomplete coverage and do not describe a limited page as the whole dataset.
