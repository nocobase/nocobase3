---
name: nocobase-app-plugin-template-print
description: 'Use when implementing or debugging server-side NocoBase 3 document generation from DOCX, XLSX, or PPTX templates, including authorized record data, downloads, attachments, QR codes, or PDF conversion. Ordinary browser page printing is outside this workflow.'
argument-hint: '[action: implement|debug] [format: docx|xlsx|pptx] [output: document|pdf]'
allowed-tools: Bash, Read, Write, Edit, Grep, Glob
owner: platform-tools
version: 1.1.1
last-reviewed: 2026-09-30
risk-level: medium
metadata:
  domain-owner: '@nocobase/app-plugin-template-print'
  current-scope: 'Guidance for App-owned NocoBase 3 template-print workflows; this package provides no runtime API'
---

# Template printing

This package provides implementation guidance only. It does not install a renderer, route, collection, or Client/Server runtime contribution; the App or business plugin owns the feature.

1. Inspect the target App's NocoBase instructions, installed renderer/version, auth and authorization model, file storage, and build setup. Resolve the template format, output, data scope, and whether the template is fixed or user-managed from the request and existing code.
2. Read [Implementation](references/implementation.md) before adding routes, queries, template storage, or download behavior. Keep authentication and authorization at the server boundary, load policy-scoped data into a plain DTO, then render.
3. Read [Rendering](references/rendering.md) for Carbone's path-based API, temporary-file handling, output bytes, and dependency constraints. The authenticated route must return binary bytes; `ApiClient.request()` parses text and `ApiClient.stream()` is for event streams.
4. Read [Office processing](references/office-processing.md) only for images, attachments, QR codes, XLSX cell images, or PDF layout processing. Read [Verification](references/verification.md) for checks appropriate to the implemented branches.
5. Include fixed Office files in the built server output explicitly; `tsc` does not copy template assets. Verify the built App from its deployed working directory and the intended Office/PDF viewer.

Use a server-owned template identifier and data scope. Require authorization before loading private records or files, cap rows and file sizes, return `Cache-Control: private, no-store`, and never accept a caller-provided filesystem path or arbitrary renderer options. Use per-job temporary files and clean them on success, failure, cancellation, and timeout.

## References

- [Implementation](references/implementation.md): v3 route, authorization, data access, Drive/file APIs, and asset packaging.
- [Rendering](references/rendering.md): renderer interface, Carbone adapter, binary response/download, and licensing.
- [Office processing](references/office-processing.md): images, attachments, QR, XLSX processing, and PDF layout.
- [Verification](references/verification.md): branch-specific test and visual inspection guidance.
