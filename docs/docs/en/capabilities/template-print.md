---
title: 'Template printing'
description: 'Use the template printing Skill to help an App Agent implement contracts, orders, and reports from Office templates and business data.'
keywords: 'NocoBase,template printing,Skill,Agent,DOCX,XLSX,PDF,contracts'
---

# Template printing

Template printing generates contracts, orders, invoices, and reports with a defined layout. Provide a template, the records to include, and your output requirements. The App Agent uses the template printing Skill to implement data filling, downloads, and the printing entry point in your application.

`@nocobase/app-plugin-template-print` provides a Skill and supporting references only. Installing it makes implementation guidance available to the Agent. Printing buttons, template management pages, and rendering services are developed for your business requirements. The package creates none of these features and requires no Client or Server registration.

## Install and synchronize the Skill

Install the package from the target application's root directory, then synchronize its Skill. These commands install a published version:

```bash
pnpm add -D @nocobase/app-plugin-template-print
pnpm nocobase skills:sync --package @nocobase/app-plugin-template-print --json
```

When developing in a NocoBase 3 source workspace that already contains the plugin, use a workspace dependency from the target application's directory:

```bash
pnpm add -D '@nocobase/app-plugin-template-print@workspace:*'
pnpm nocobase skills:sync --package @nocobase/app-plugin-template-print --json
```

A version not yet published to your registry requires the workspace package or a locally packed archive. `workspace:*` only works within the same workspace; it cannot download an npm package into a standalone application.

After synchronization, the application contains `.agents/skills/nocobase-app-plugin-template-print/SKILL.md` and its references. Run synchronization again after upgrading the package. This directory is generated local content and is replaced on the next sync. Keep business code and templates in the application's own directories.

## Prepare your printing requirements

For the first implementation, prepare an actual template and a representative business record, and describe:

| Item                | Example                                                                           |
| ------------------- | --------------------------------------------------------------------------------- |
| Entry point         | Add a “Print contract” button to the order details page                           |
| Template and layout | Use an existing DOCX contract and preserve its header, tables, and signature area |
| Data to fill        | Customer name, order number, line items, quantities, unit prices, and total       |
| Record scope        | Current order, selected records, current page, or all filtered results            |
| Output              | Download DOCX, download PDF, or open a PDF for printing                           |
| Permissions         | Only print orders and attachments the current user may read                       |

Give the Agent your existing template. If field tags have not been defined, ask it to add them based on the actual data structure. If you have no template, describe the desired layout and review the template sample the Agent creates first.

Here, Agent means the development Agent working in your application's source directory. Once development is complete, business users use the page's buttons without learning Skills or writing prompts.

## Ask the Agent to implement printing

Use a development tool that reads project Skills from the target application's directory, and describe the printing requirement. You can explicitly name `nocobase-app-plugin-template-print` in your request.

### Print an order contract

> Use the nocobase-app-plugin-template-print Skill to add a “Print contract” button to the order details page. Fill the DOCX template I provided with the current order's customer name, order number, line items, and amounts. Preserve the layout and support DOCX download. Only use data the current user may read. Inspect the existing order fields and page first, then implement and verify with the actual template.

The Agent should reuse the application's data access, permissions, and page structure, adding rendering dependencies as needed. After implementation, open an order, download the contract, and check its fields, line count, amounts, and pagination against the template requirements.

### Print multiple records

Specify both the record scope and how the files should be organized. For example:

> Add “Export shipping list” to the order list. Use the supplied XLSX template and include only the orders I selected, sorted by order number. Show the recipient, address, and product details for each order in one XLSX file. If nothing is selected, ask the user to select records; if more than 200 orders are selected, ask them to reduce the selection. Verify selections across filtered pages and how unauthorized records are handled.

Selected records, the current page, and all filtered results require different queries. “Print the list” alone does not establish how pagination, selection, and filters interact. Record limits depend on business requirements and deployment resources; this package provides no runtime limit.

### Add images, QR codes, or PDF

Extend an existing feature with concrete requirements:

> Show the company logo and the current order's attachment images in the contract, and add a QR code linking to the order page. Add PDF download and verify Chinese text, image sizes, and pagination with the deployment's fonts. Unauthorized attachments must not appear in the document. Display a clear error if conversion fails.

DOCX, XLSX, and PPTX are template formats to consider during implementation. Actual support depends on what the Agent implements and verifies. Specify where images appear, such as the body, header, footer, or Excel cells. QR codes and linear barcodes are different requirements; specify the encoding type if you need a linear barcode.

PDF conversion usually needs an additional server-side conversion environment. For example, the embedded Carbone conversion path requires compatible LibreOffice and fonts. Ask the Agent to identify deployment requirements for the chosen approach and verify the final PDF. After downloading or opening a PDF, users can choose a printer through their viewer. Silent access to a local printer needs a separate implementation.

### Manage multiple templates

Ask for template management only when business users need to maintain templates. For example:

> Sales contracts have domestic and international versions. Allow administrators to upload and replace templates, and let sales staff choose a version when printing. Bind the templates to order data and handle in-flight document generation correctly when a template is replaced. Sales staff must not be able to modify templates.

Fixed templates can be maintained with the application. Uploads, version management, template selection, and management permissions are additional business features to specify in your request.

## Review the result

Ask the Agent to provide a sample template, generated files, the checks it ran, and any unverified formats or deployment conditions. Check that:

- Files open in the intended Office viewer without repair prompts, with correct fields and repeating line items.
- Record scope matches selection, filtering, and pagination requirements, with no unauthorized data or attachments.
- Empty line items, long text, multi-page tables, Chinese fonts, and images display correctly in the actual layout.
- Download filenames and formats are correct, with clear errors for missing templates, empty results, and conversion failures.
- If PDF is required, conversion, fonts, and pagination are verified in the deployment environment, beyond a successful development-machine download.

Skill synchronization only establishes that the Agent can read the guidance. A completed feature also needs its business page, server implementation, and generated-file verification.

## Common questions

### Why is there no printing button after installation?

The package provides development guidance. Button placement and printing behavior depend on your application requirements. After installing and synchronizing it, give the App Agent a specific printing task.

### What if the Agent cannot find the Skill?

Confirm that the development tool has opened the target application's directory, the package is installed as that application's direct dependency, and synchronization succeeded. Then ask the Agent to read `.agents/skills/nocobase-app-plugin-template-print/SKILL.md`. If the file exists but is not discovered, check how the tool loads project Skills.

### What if the generated layout is wrong?

Provide the original template, generated file, viewer name, and a specific difference, such as “the table is clipped on page two” or “the Chinese font was replaced.” Ask the Agent to distinguish data filling, Office layout, and PDF conversion problems, then verify the updated file.

## Related links

- [Writing requirements](../ai/writing-requirements.md) — Give the App Agent clear business rules
- [Files](./file.md) — Uploads, attachments, and file access
- [Permissions](./authorization.md) — Access to data and features
- [Plugin Skills](../plugin-development/skills.md) — Publishing, synchronizing, and maintaining Skills
