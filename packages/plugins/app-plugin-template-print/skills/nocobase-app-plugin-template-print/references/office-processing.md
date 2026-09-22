# Office images and PDF layout

Read this reference only for the image or layout branches being implemented. The algorithms below define v3-owned processing boundaries and are not runtime capabilities shipped by this package.

## Custom image descriptors

The App-owned formatter may emit a descriptor that survives XML interpolation; postprocessing resolves that descriptor into image bytes. One possible wire format is `internal_attachment|` plus base64 JSON `{ id }`, or `internal_barcode|` plus base64 JSON `{ text, type }`. Base64 transports the descriptor; it does not authorize access or make its contents trustworthy.

Register formatters once through the selected engine's documented formatter API. This example illustrates descriptor generation, not image insertion:

```ts
import carbone from 'carbone';

function descriptor(prefix: string, payload: object): string {
  return (
    prefix + Buffer.from(JSON.stringify(payload), 'utf8').toString('base64')
  );
}

carbone.addFormatters({
  attachment(id: string): string {
    return id ? descriptor('internal_attachment|', { id }) : '';
  },
  barcode(text: string, type: string = 'qrcode'): string {
    if (!text) return '';
    if (type !== 'qrcode') throw new Error('Unsupported barcode type');
    return descriptor('internal_barcode|', { text, type });
  },
});
```

The example deliberately rejects unsupported barcode types; use a separate verified implementation if the user needs linear barcodes. Choose QR image format, error correction, margin, and scale as part of the App contract, then test the generated code at the final print dimensions.

## Resolve image bytes under authorization

Define a resolver returning bytes plus verified MIME type and extension. It should support only the sources the App needs:

- Attachment descriptors resolve an App-owned file ID using the current principal and parent-record access, then read through the installed file repository or Drive service.
- Stable same-App file URLs may be used only for deliberately public assets. For private attachments, resolve the file ID through the authorized repository or storage service instead of fetching a public content URL. Reject cross-App/source mismatches and expired or invalid credentials according to the App contract.
- Remote images, if required, need a deliberate URL policy, timeout, byte limit, content validation, and redirect checks. Restrict access to internal hosts and metadata endpoints according to the deployment's network boundary.
- Local assets resolve within a configured asset root using canonical path containment. Prefer file IDs for uploaded assets.

Use one authorized resolution boundary for attachment descriptors and private file IDs. Do not construct file URLs from collection or record identifiers, and do not treat a public content URL as proof of authorization; resolve private files through the installed App's File Repository contract.

Detect or normalize actual image bytes, then keep the media filename, relationship target, MIME metadata, and `[Content_Types].xml` consistent. Treat failed fetches as an explicit render error or a documented placeholder; avoid producing broken binary parts silently.

## DOCX picture placeholders

If the selected template contract places an image expression in a picture's alternative-text description, renderer output may leave a descriptor or URL in `wp:docPr/@descr`. The postprocessor finds the nearby `a:blip/@r:embed`, creates a media part, clones or creates a relationship, and replaces the embed reference.

Preserve these relationships as a unit:

```text
word/document.xml: a:blip r:embed="rIdImage"
word/_rels/document.xml.rels: Id="rIdImage", Target="media/image.png"
word/media/image.png: actual PNG bytes
[Content_Types].xml: compatible image content type
```

Use collision-free relationship IDs within each part. Repeated rows may initially share the same embed ID: distinct resolved images need distinct targets, while equal descriptors may reuse bytes within the request. Preserve existing static pictures and size/crop settings. Close XML DOM resources when the library requires it and parse Office parts as XML, not HTML.

The main-document algorithm processes only `word/document.xml` and its relationship table. Header/footer images, text boxes in other parts, and multiple part-specific relationship tables require explicit support. Do not promise them from the main-document algorithm. Missing original relationships should produce a useful error or a correct new relationship rather than a document with dangling IDs.

## XLSX cell images

Excel in-cell images can live in rich-data metadata rather than ordinary drawing anchors. A v3 Office adapter can read `xl/richData/rdrichvalue.xml` and `rdrichvaluestructure.xml`, locate worksheet cells with `vm`, and move a template expression from the rich value into an inline `<t>` marker. This makes the expression available to the selected renderer's normal XML processing and row repetition.

After interpolation, the postprocessor resolves each marked expression, appends media and rich-data entries, and restores a worksheet cell with the right `vm`. Relevant parts include `xl/metadata.xml`, `xl/richData/richValueRel.xml`, its `.rels`, and the rich value data/structure files. Preserve existing entries and update counts, references, and content types together.

Index bases differ: worksheet `vm` is one-based, while rich-value and relationship array indexes can be zero-based. Follow the actual XML reference chain rather than deriving every index from the count of new images. Repeated images, existing static images, multiple worksheets, and non-template rich cells all need fixtures. Remove temporary markers from the final document.

Leave cells without a recognized template expression unchanged, including literal URLs in rich-data values, unless the App explicitly offers remote-image conversion for such cells. Sheets without rich-data files are a normal case, not a reason to manufacture incomplete metadata. If adding cell images to those files, create the whole valid part graph deliberately.

Floating drawing images and WPS-specific representations are separate compatibility branches. A rich-data implementation alone does not cover every spreadsheet image format. Verify Excel, WPS, or LibreOffice behavior only for viewers the user needs.

## DOCX-to-PDF East Asian spacing

Some PDF converters render paragraphs incorrectly when Latin/East Asian automatic spacing is explicitly disabled with `w:autoSpaceDE` and `w:val` equal to `0`, `false`, or `off`. If the selected converter reproduces this defect, a PDF-only postprocessor may insert U+2060 WORD JOINER at adjacent Latin/East Asian script boundaries, including text split across runs. Existing joiners must be preserved without duplication.

The traversal resets at tabs, breaks, drawings, and objects; it does not join across paragraphs or alter paragraphs with automatic spacing enabled. The character rule covers Han, Hiragana, Katakana, Hangul, and Bopomofo against Latin; it is not a blanket rule for numbers or all punctuation. Inherited style settings are outside the direct-property detector.

Apply this compatibility workaround only when the selected converter reproduces the defect, retain its narrow conditions and PDF-only scope, and test text extraction as well as appearance. Do not insert invisible characters throughout all source documents.

## Conversion lifecycle

Write an intermediate document to a per-job safe path, invoke the configured converter, read the output into a Buffer unless file mode was explicitly selected, and remove intermediate/output files. Clean up on success, failure, cancellation, and timeout without masking the primary conversion error.

Verify installed fonts, fallback behavior, page size, margins, table pagination, and image resolution using the final deployment converter. A structurally valid DOCX or XLSX is not evidence that the converted PDF preserves the layout.
