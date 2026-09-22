# Rendering engine and core examples

## Table of Contents

- [Dependencies](#dependencies)
- [Minimal public-API adapter](#minimal-public-api-adapter)
- [Data and tag examples](#data-and-tag-examples)
- [Format-specific processing pipeline](#format-specific-processing-pipeline)

## Dependencies

The Skill package installs none of these dependencies. The target App or runtime business plugin must declare the selected server Renderer as a direct dependency, pin the resolved version, inspect its documented public APIs, and lock/test that combination.

| Dependency               | Purpose and v3 decision                                                                                                           |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `carbone`                | Office template rendering and conversion integration. Use documented `render` and formatter APIs exposed by the selected version. |
| `@types/carbone`         | Type declarations when the selected engine does not provide them. Verify compatibility with the resolved engine version.          |
| `jsdom`                  | XML DOM manipulation for Office image and layout extensions, only when those extensions are implemented.                          |
| `qrcode`                 | QR code PNG generation. It is not a general one-dimensional barcode library.                                                      |
| `fs-extra`               | File helpers when the App's Node APIs are not sufficient.                                                                         |
| ZIP library              | Archive inspection or rebuilding when the selected public renderer API does not provide the required operation.                   |
| Browser download utility | Client-side download support when the App's existing Blob/download utility is insufficient.                                       |
| Timezone library         | Timezone formatting only when required by the App contract and not already provided by the App.                                   |
| LibreOffice and fonts    | Deployment prerequisites for PDF conversion, not npm dependencies. Same-format rendering can work without a converter.            |

In a target App, server render libraries belong in `dependencies`, while browser and build libraries belong in `devDependencies`. In a runtime business plugin, ordinary server imports are dependencies and browser imports resolved by consumers are peers. Types needed only for development remain development dependencies.

The [official embedded Node API](https://carbone.io/documentation/developer/embedding/embedding-in-node.html) documents `render`, `addFormatters`, buffer/path return modes, and LibreOffice requirements. [verified: 2026-09-22] Check the selected version's source and types before implementing extensions; do not infer embedded capabilities from unrelated SDK or edition documentation.

Keep the external interface small so Routes and business data loaders do not depend on a particular Renderer:

```ts
type RenderRequest = {
  format: 'docx' | 'xlsx' | 'pptx';
  template: Uint8Array;
  data: Record<string, unknown> | Record<string, unknown>[];
  output: 'document' | 'pdf';
  locale?: string;
  timezone?: string;
};

type RenderedDocument = {
  bytes: Uint8Array;
  mimeType: string;
  filename: string;
};

interface TemplateRenderer {
  render(request: RenderRequest): Promise<RenderedDocument>;
}
```

The Renderer implementation owns engine options, Office processing, conversion, limits, and cleanup behind this interface. The package does not provide this implementation or install its dependencies.

## Minimal public-API adapter

This illustrative TypeScript adapter is intended for an App-owned server module after installing a compatible engine and declarations. It accepts an already resolved, authorized template path and plain data; authentication, query construction, upload validation, resource limits, and HTTP handling belong outside it. No such module is exported by this Skill package.

```ts
import carbone from 'carbone';

type PrintData = Record<string, unknown> | Record<string, unknown>[];
type PrintOptions = { pdf?: boolean; timezone?: string; lang?: string };

export function renderOffice(
  templatePath: string,
  data: PrintData,
  options: PrintOptions = {},
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    carbone.render(
      templatePath,
      data,
      {
        ...(options.pdf ? { convertTo: 'pdf' } : {}),
        ...(options.timezone ? { timezone: options.timezone } : {}),
        ...(options.lang ? { lang: options.lang } : {}),
      },
      (error, result) => {
        if (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
          return;
        }
        if (!Buffer.isBuffer(result)) {
          reject(new Error('Expected rendered document bytes'));
          return;
        }
        resolve(result);
      },
    );
  });
}
```

Omitting `renderPrefix` keeps the buffer contract. If choosing a file-return mode for large documents, change the return type, stream the actual file bytes, and clean it up after completion or failure; returning its path as an HTTP body does not download the document. Set process-level renderer configuration at startup, not from request-specific values.

## Data and tag examples

An invoice can use this object as `data`:

```json
{
  "number": "INV-001",
  "customer": { "name": "Acme" },
  "status": { "value": "paid", "label": "Paid" },
  "lines": [
    { "title": "Service A", "quantity": 2, "amount": 30 },
    { "title": "Service B", "quantity": 1, "amount": 20 }
  ]
}
```

Use `{d.number}`, `{d.customer.name}`, and `{d.status.label}` for scalar values. A repeating line table uses `{d.lines[i].title}` and corresponding quantity/amount tags in a pattern row, with a following row using `{d.lines[i+1].title}` to establish the repetition boundary. Root-array templates instead use `{d[i].number}` and `{d[i+1].number}`. Verify the row layout in the selected engine; a single `[i]` tag alone is not a complete repeatable-table example. The renderer supplies the `d` root: pass the object/array directly, not `{ d: data }` unless the template intentionally uses an extra level.

Custom image tags such as `{d.attachments[0].id:attachment()}` require a formatter and Office postprocessor defined by the owning App, as described in [office-processing.md](office-processing.md). They are not built-in image-loading APIs.

## Format-specific processing pipeline

Use an App-owned adapter around documented renderer APIs when a format needs processing beyond ordinary text interpolation. The following stages are a sequencing contract, not imports from a renderer:

```text
parse options and normalize conversion target
open the archive and validate its actual format
render through the selected engine's documented API
run format-specific pre-processing only when the selected format requires it
apply data and options to the marked Office parts
run format-specific post-processing only when the selected format requires it
rebuild the archive with unmarked binary media preserved
convert if needed, then return bytes or an explicitly managed file
```

Keep raw binary media unmarked and preserve unrelated Office parts. Marker discovery must use the selected renderer's documented contract or an App-owned Office parser; tags split across XML runs must be handled before relation loading.

If the selected feature has no documented public API, stop and record the unsupported branch instead of importing undocumented renderer internals. Do not add an adapter around undocumented engine modules as part of this Skill's implementation path.

The supported format contract for this Skill is DOCX, XLSX, and PPTX. Establish plain PPTX rendering first and verify advanced PPTX behavior separately. A format-specific processor must be selected based on the actual template structure and tested with the intended viewer.
