---
name: nocobase-app-plugin-template-print
description: Use when implementing or debugging NocoBase 3 template printing with DOCX, XLSX, or PPTX templates and business data, including record/list output, attachments, QR codes, or PDF conversion; ordinary browser page printing is outside this workflow.
argument-hint: '[action: implement|debug] [format: docx|xlsx|pptx] [output: document|pdf|printable-pdf]'
allowed-tools: Bash, Read, Write, Grep, Glob
owner: platform-tools
version: 1.0.0
last-reviewed: 2026-09-22
risk-level: medium
---

# Goal

Implement or debug an App-owned NocoBase 3 template-printing workflow that produces an authorized document or PDF from a DOCX, XLSX, or PPTX template and business data, with the selected feature branches verified in the intended viewer and deployment.

# Scope

This package provides implementation guidance only. It exports no rendering service, route, database collection, or Client/Server plugin. The App or business plugin owns the feature you implement. There is no pre-existing template-print API to call after installing this package.

# Non-Goals

- Do not implement ordinary browser page printing or silent physical-printer access.
- Do not assume this package installs a renderer, creates a route or collection, or supplies Client/Server runtime registration.
- Do not copy legacy v2 APIs, private Carbone internals, or unverified format support into a v3 App.

# Input Contract

| Input                | Required                           | Default                                                                         | Validation                                                                   | Clarification Question                                                        |
| -------------------- | ---------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `action`             | yes                                | `implement` for a new feature; `debug` when a concrete failure is reported      | enum: `implement`, `debug`                                                   | "Should I implement the workflow or diagnose an existing one?"                |
| `format`             | yes                                | use the supplied template extension; otherwise start with `docx`                | enum: `docx`, `xlsx`, `pptx`; must match the actual template                 | "Which template format must be supported?"                                    |
| `output`             | no                                 | same-format document download; add `pdf` only when requested                    | enum: `document`, `pdf`, `printable-pdf`                                     | "Should the result be the source format, a PDF download, or a printable PDF?" |
| `data-scope`         | yes when business data is rendered | one record for a record request; otherwise ask before selecting a broader scope | enum: `record`, `selected`, `current-page`, `all-filtered`; explicit maximum | "Which records may be printed?"                                               |
| `template-ownership` | no                                 | fixed App-owned asset unless managed uploads are requested                      | enum: `fixed-asset`, `managed-upload`; separate manage/use permissions       | "Is the template fixed by the App or managed by users?"                       |
| `locale-timezone`    | no                                 | the App's current locale and timezone                                           | validate against the App contract before querying or formatting              | "Which locale and timezone should labels and dates use?"                      |

The supplied template, App instructions, installed package versions, and existing business code are authoritative for details not listed here. If the user says "you decide", use the defaults above, state them in the implementation notes, and keep the first slice to one format, one representative template, and one authorized download.

# Mandatory Clarification Gate

Resolve the target App, actual template format, output mode, data scope, template ownership, authorization boundary, and converter prerequisites before adding or changing an endpoint, data query, schema, dependency, or file-processing path. If a required input is missing or ambiguous, stop and ask; do not mutate code or storage before the answer. Max clarification rounds: 2. Max questions per round: 3.

Inspect the target App's instructions, installed versions, server composition, business data access, file storage, and action UI. Use its available `nocobase-app-development` Skill for v3 composition; use the installed authentication, authorization, and file Skills when integrating those capabilities. If a referenced Skill is absent, inspect the installed package's public exports and existing App usage before choosing an API.

Determine these from the request, existing code, and supplied template; ask only about choices that materially change the result:

- Template format and output: same-format document, PDF download, or opening a printable PDF. A download is not silent physical-printer access.
- Data shape: one record with child rows, selected records, current page, or all filtered records. Keep these scopes distinct.
- Template ownership: a fixed App-owned asset or user-managed uploads; who may manage a template and who may render it.
- Required relations, option labels, locale/timezone, images, QR codes, and expected output size.

Read [implementation.md](references/implementation.md) before adding an endpoint or data query. Start with one requested format, a representative template, authorized data, and a downloadable result. Add template management or PDF conversion only when the requested workflow needs it.

# Workflow

1. Read [rendering.md](references/rendering.md) for dependency choices, the minimal Carbone adapter, the data contract, and the legacy extension pipeline. Choose public APIs first; isolate and pin any required private-engine adapter.
2. When the template includes images, attachments, QR codes, XLSX cell images, or a PDF spacing defect, read [office-processing.md](references/office-processing.md). Plain text rendering does not provide the legacy image extensions automatically.
3. Implement in the target App or owning business plugin using explicit v3 composition. Keep authentication and authorization at the server boundary, data loading separate from rendering, and heavy render/conversion work on the server. Register only actual runtime contributions you add.
4. Follow [verification.md](references/verification.md) for the implemented branches. Verify document contents and layout with a real template, permissions with different principals, and deployed dependencies for the selected output.
5. Deliver the requested action, a working template example with its data shape, and a generated document that opens correctly in the intended viewer. Report the checks run, supported format/feature combinations, converter prerequisites, and any unverified branch.

Use [legacy-source-map.md](references/legacy-source-map.md) only when tracing a historical implementation detail or comparing a defect. Its relative source paths describe the old plugin, not imports that should appear in a v3 App. All essential guidance is included here; a legacy checkout is optional.

# Reference Loading Map

| Reference                                               | Load when                                                                    | Purpose                                                                               |
| ------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| [implementation.md](references/implementation.md)       | adding an endpoint, query, template store, or download flow                  | v3 ownership, authorization, data contract, uploads, and deployment boundaries        |
| [rendering.md](references/rendering.md)                 | selecting dependencies, Carbone APIs, tags, or private adapters              | renderer contract, data examples, and legacy pipeline boundaries                      |
| [office-processing.md](references/office-processing.md) | implementing images, attachments, QR codes, XLSX cell images, or PDF spacing | authorized image resolution, Office package processing, and conversion cleanup        |
| [verification.md](references/verification.md)           | verifying an implemented branch                                              | fixture matrix, permission cases, deployment checks, and structural/visual inspection |
| [legacy-source-map.md](references/legacy-source-map.md) | tracing a historical defect or behavior                                      | source locations and adaptation warnings; never use it as a v3 API contract           |

# Safety Gate

High-impact actions include accepting or replacing managed templates, writing rendered files, invoking a converter, adding a route or query that accesses private data, and using private renderer internals.

Before any high-impact action, validate the template identity, actual file structure, authorized data scope, output limits, storage boundary, and converter configuration. Do not accept caller-provided filesystem paths or arbitrary renderer options. Keep private engine calls inside one pinned adapter and reject unsupported formats explicitly.

For managed uploads, retain the previous revision until the replacement is validated; remove failed temporary files and read back the stored metadata and content identity after each write. For rendering and conversion, use per-job temporary paths and clean them up on success, failure, cancellation, and timeout without masking the primary error. If implementation scope changes materially, stop and ask for confirmation before proceeding.

Rollback guidance: restore the previous template revision, remove only the failed upload or job temporary files, and revert the route/query/dependency changes made for the current task. Never delete an existing user template or private output without an explicit target and confirmation.

# Verification Checklist

- Confirm the target App, installed package versions, selected format, output mode, data scope, and template ownership.
- Render a representative authorized template successfully and verify the expected document bytes, MIME type, filename, and viewer compatibility.
- Verify Unicode, XML special characters, zero, false, null, option labels, dates, timezone, and nested relations retain their intended values.
- Verify zero, one, and several child rows, root arrays, ordering, totals, and repetition boundaries with real templates.
- Verify selected-record, current-page, and all-filtered scopes preserve policy filters, stable ordering, limits, and composite keys.
- Verify allowed template use and data access for the intended principal, then verify denied template, row, field, relation, and attachment access.
- Verify missing required input, unsupported format, invalid template structure, over-limit data, and unavailable converter produce controlled failures before mutation.
- Verify every upload, revision, generated-file, and metadata write with an immediate readback of identity, size, content, or final path.
- Verify failed, cancelled, timed-out, and concurrent renders clean temporary files and preserve the primary error and previous valid revision.
- Unzip Office output and inspect changed XML, relationships, content types, media bytes, and unresolved markers; then open it in the intended viewer.
- For PDF output, inspect page count, fonts, CJK glyphs, margins, table breaks, image placement, extracted text, and mixed Latin/CJK spacing.
- Record the engine and converter versions, template revision, sample input, asserted results, visually checked viewers, and unsupported or unverified combinations.

# Minimal Test Scenarios

1. Render one representative DOCX, XLSX, or PPTX template with scalar values, a nested relation, and an authorized principal; verify the output opens and contains the expected values.
2. Render child rows or a root array with zero, one, and several entries; verify ordering, repetition boundaries, and totals.
3. Omit a required template, format, or data scope and verify execution stops for clarification before code, storage, or renderer mutation.
4. Use a denied principal or protected attachment and verify authorization failure occurs at the server boundary without leaking records, fields, relations, or file bytes.
5. Submit an invalid or over-limit template, unavailable converter, timeout, or failed upload and verify a controlled failure, immediate cleanup, and preservation of the previous valid revision.

# References

- [Application implementation](references/implementation.md)
- [Rendering engine and core examples](references/rendering.md)
- [Office images and PDF layout](references/office-processing.md)
- [Verification guide](references/verification.md)
- [Legacy implementation source map](references/legacy-source-map.md)
