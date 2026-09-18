---
name: nocobase-app-plugin-template-print
description: Implement or debug template printing in a NocoBase 3 App using DOCX, XLSX, or PPTX templates and business data, including record/list printing, attachments, QR codes, and PDF conversion. Use for 模板打印, invoice or contract template generation; ordinary browser page printing is outside this workflow.
---

# Implement template printing

This package provides implementation guidance only. It exports no rendering service, route, database collection, or Client/Server plugin. The App or business plugin owns the feature you implement. There is no pre-existing template-print API to call after installing this package.

## Establish the contract

Inspect the target App's instructions, installed versions, server composition, business data access, file storage, and action UI. Use its available `nocobase-app-development` Skill for v3 composition; use the installed authentication, authorization, and file Skills when integrating those capabilities. If a referenced Skill is absent, inspect the installed package's public exports and existing App usage before choosing an API.

Determine these from the request, existing code, and supplied template; ask only about choices that materially change the result:

- Template format and output: same-format document, PDF download, or opening a printable PDF. A download is not silent physical-printer access.
- Data shape: one record with child rows, selected records, current page, or all filtered records. Keep these scopes distinct.
- Template ownership: a fixed App-owned asset or user-managed uploads; who may manage a template and who may render it.
- Required relations, option labels, locale/timezone, images, QR codes, and expected output size.

Read [implementation.md](references/implementation.md) before adding an endpoint or data query. Start with one requested format, a representative template, authorized data, and a downloadable result. Add template management or PDF conversion only when the requested workflow needs it.

## Implement the selected path

1. Read [rendering.md](references/rendering.md) for dependency choices, the minimal Carbone adapter, the data contract, and the legacy extension pipeline. Choose public APIs first; isolate and pin any required private-engine adapter.
2. When the template includes images, attachments, QR codes, XLSX cell images, or a PDF spacing defect, read [office-processing.md](references/office-processing.md). Plain text rendering does not provide the legacy image extensions automatically.
3. Implement in the target App or owning business plugin using explicit v3 composition. Keep authentication and authorization at the server boundary, data loading separate from rendering, and heavy render/conversion work on the server. Register only actual runtime contributions you add.
4. Follow [verification.md](references/verification.md) for the implemented branches. Verify document contents and layout with a real template, permissions with different principals, and deployed dependencies for the selected output.

Use [legacy-source-map.md](references/legacy-source-map.md) only when tracing a historical implementation detail or comparing a defect. Its relative source paths describe the old plugin, not imports that should appear in a v3 App. All essential guidance is included here; a legacy checkout is optional.

## Completion

Deliver the requested action, a working template example with its data shape, and a generated document that opens correctly in the intended viewer. Report the checks run, supported format/feature combinations, converter prerequisites, and any unverified branch. Skill synchronization establishes availability of instructions; it does not establish that template printing works.
