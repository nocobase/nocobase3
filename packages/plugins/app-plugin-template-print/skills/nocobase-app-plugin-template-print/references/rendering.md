# Rendering engine and core examples

## Dependencies

These ranges come from the inspected legacy plugin manifest, not a recommendation to install today's latest versions. The Skill package installs none of them. Select dependencies only for the target implementation, inspect the resolved version and public APIs, and lock/test the chosen combination.

| Dependency in the legacy manifest  | Purpose and v3 decision                                                                                                                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `carbone ^3.5.6`                   | Office template rendering, built-in formatters, and conversion integration. Start with public `render`/`addFormatters`; the extended legacy pipeline uses private `carbone/lib/*` modules. |
| `@types/carbone ^3.2.5`            | Type declarations; check compatibility with the chosen engine rather than assuming identical versions.                                                                                     |
| `jsdom ^25.0.1`                    | XML DOM manipulation for Office image and layout extensions. Needed only when implementing those extensions.                                                                               |
| `qrcode ^1.5.4`                    | Generates QR code PNG bytes. It is not a general one-dimensional barcode library.                                                                                                          |
| `fs-extra ^11.1.1`                 | File helpers; prefer Node filesystem APIs where equivalent.                                                                                                                                |
| `yauzl 2.10.0`, `yazl 2.5.1`       | ZIP tools declared by the old package; the inspected core render path delegates archive open/build to Carbone. Add direct dependencies only if the new implementation directly uses them.  |
| `file-saver ^2.0.5`                | Browser download helper; the App's existing Blob/download utility may suffice.                                                                                                             |
| `dayjs-timezone-iana-plugin 0.1.0` | Listed by the old package; do not assume it must be installed for every renderer. Check actual timezone formatting needs and imports.                                                      |
| LibreOffice and fonts              | External deployment prerequisites for the embedded engine's PDF conversion, not npm dependencies. Same-format rendering can work without a converter.                                      |

The old manifest lists many runtime imports as `devDependencies`; do not copy that placement. In a target App, server render libraries belong in `dependencies`, browser/build libraries in `devDependencies`. In a runtime business plugin, ordinary server imports are dependencies, browser imports resolved by consumers are peers, and identity-sensitive NocoBase runtimes follow their shared peer contract. Types needed only for development remain development dependencies.

The [official embedded Node API](https://carbone.io/documentation/developer/embedding/embedding-in-node.html) documents `render`, `addFormatters`, buffer/path return modes, and LibreOffice requirements. Its Community/Enterprise feature distinction matters: do not infer that a Cloud SDK example or Enterprise dynamic-image feature exists in embedded Carbone 3.x. Check the selected version's source and types before implementing extensions.

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

Omitting `renderPrefix` keeps the buffer contract. If choosing a file-return mode for large documents, change the return type, stream the actual file bytes, and clean it up after completion or failure; returning its path as an HTTP body does not download the document. Set process-level Carbone configuration at startup, not from request-specific values.

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

Use `{d.number}`, `{d.customer.name}`, and `{d.status.label}` for scalar values. A repeating line table uses `{d.lines[i].title}` and corresponding quantity/amount tags in a pattern row, with a following row using `{d.lines[i+1].title}` to establish the repetition boundary. Root-array templates instead use `{d[i].number}` and `{d[i+1].number}`. Verify the row layout in the selected engine; a single `[i]` tag alone is not a complete repeatable-table example. Carbone supplies the `d` root: pass the object/array directly, not `{ d: data }` unless the template intentionally uses an extra level.

Image tags from the old field picker, such as `{d.attachments[0].id:attachment()}`, require the custom formatter and Office postprocessor described in [office-processing.md](office-processing.md). They are not built-in image-loading APIs.

## Extended legacy pipeline

The old renderer reassembles Carbone internals to insert format-specific operations. The following is sequencing pseudocode; these names are adapter stages, not v3 package exports:

```text
parse options and normalize conversion target
open archive and detect its actual format
run Carbone preprocessor
run format-specific pre-build transform (legacy: XLSX only)
build XML for every marked part with data and options
build reportName if present
run format-specific postprocess (legacy: DOCX and XLSX)
rebuild archive with unmarked binary media preserved
convert if needed, return bytes or an explicitly managed file
```

`walkFiles` calls `builder.buildXML` only on marked files and then resolves the optional report name. Keep raw binary media unmarked. Marker discovery separately uses `parser.findMarkers`, `parser.preprocessMarkers`, and `extracter.splitMarkers` after preprocessing to plan relation loading.

Private dependencies include `input`, `file`, `preprocessor`, `builder`, `parser`, `extracter`, `converter`, `helper`, and `params`. If the selected feature requires this route, keep all private calls in one version-specific adapter, pin the actual engine version, and cover archive fixtures before upgrades. Do not copy the entire private pipeline merely to replace ordinary text.

The old upload/render allowlist is DOCX, XLSX, PPTX, although the underlying engine mentions more formats. PPTX has no custom image handler in the inspected dispatch maps; establish plain rendering first and verify any advanced PPTX behavior separately. The existence of a DOCX pre-build file also does not imply it runs: the inspected pre-build dispatch map only enables XLSX.
