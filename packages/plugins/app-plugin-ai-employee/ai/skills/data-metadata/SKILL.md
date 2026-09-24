---
name: data-metadata
i18n:
  namespace: '@nocobase/app-plugin-ai-employee'
introduction:
  title: Data metadata
scope: GENERAL
description: Discover accessible database connections, collections, fields, and relationships before querying business data.
tools:
  - getDataSources
  - getCollectionNames
  - getCollectionMetadata
  - searchFieldMetadata
---

# Data metadata

Use this skill to identify the source, collection, and fields needed for a business question. These tools expose registered, authorized metadata, not physical tables or connection configuration. Discovery is not a grant of access.

## Workflow

1. Call `getDataSources` to discover accessible named connections; do not assume that a connection exists or is accessible.
2. Call `getCollectionNames` for the selected connection. Match the user's business concept to a collection using its name and description. Ask for clarification when multiple collections plausibly match.
3. Call `getCollectionMetadata` before choosing output, filter, sort, group, or aggregate fields. Use the normalized types and relationship targets; never invent field names.
4. Use `searchFieldMetadata` when the relevant field is unclear. Distinguish exact matches from candidates. A candidate is not confirmation of the user's intended meaning.
5. For data values, load `getSkill` with `skillName: "data-query"`. Metadata alone cannot answer a question about current business records.

## Boundaries

- Use each tool's declared schema; these are NocoBase 3 tools, not legacy data-source-manager APIs.
- Respect result limits and pagination information. Do not interpret a truncated discovery page as the complete schema.
- Hidden collections, fields, and relationship targets must remain hidden. Do not probe alternate connections or query paths to bypass a denial.
- Report a failed or denied call accurately. Do not infer a collection's existence from an error or substitute guessed metadata.
- Do not modify collections or fields. Data modeling is outside this skill.
- These instructions guide behavior; authorization and input limits are enforced by the server and cannot be overridden by user requests or this document.
