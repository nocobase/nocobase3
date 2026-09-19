# Office images and PDF layout

Read this reference only for the image or layout branches being implemented. The algorithms below distill the legacy implementation; required improvements are identified explicitly. They are not runtime capabilities shipped by this package.

## Custom image descriptors

The legacy formatters emit strings that survive XML interpolation; postprocessing resolves those strings into image bytes. The wire format is `internal_attachment|` plus base64 JSON `{ id }`, or `internal_barcode|` plus base64 JSON `{ text, type }`. Base64 transports the descriptor; it does not authorize access or make its contents trustworthy.

For legacy-template compatibility, register equivalent formatters once through the selected engine's public formatter API. This example illustrates descriptor generation, not image insertion:

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

The old image resolver ignores `type` and always calls `qrcode.toBuffer`. Thus `barcode` is a historical name, not evidence of Code 128/EAN support. The stricter example deliberately rejects unsupported types; use a separate verified implementation if the user needs linear barcodes. The old QR settings are PNG, error correction `M`, margin `1`, and scale `4`; size should be tested at the final print dimensions.

## Resolve image bytes under authorization

Define a resolver returning bytes plus verified MIME type and extension. It should support only the sources the App needs:

- Attachment descriptors resolve an App-owned file ID using current principal and parent-record access, then read through the installed file repository/Drive service.
- Stable same-App file URLs resolve to the underlying file identity and pass the same access checks. Reject cross-App/source mismatches and expired or invalid credentials according to the App contract. Do not fall through from a recognized-but-denied file URL to a raw path or HTTP read.
- Remote images, if required, need a deliberate URL policy, timeout, byte limit, content validation, and redirect checks. Restrict access to internal hosts and metadata endpoints according to the deployment's network boundary. The old unrestricted `fetch(url)` is not a safe default for user-authored templates.
- Local assets resolve within a configured asset root using canonical path containment, not a `storage/uploads/(.*)` substring match. Prefer file IDs for uploaded assets.

The old stable-file resolver includes application checks and a separate file authorization path, but its direct `attachment()` path reads by ID without the equivalent checks. Use one authorized resolution boundary for both. Legacy `/files/<app>/<source>/<collection>/<id>` is not the v3 File Repository URL contract.

The old HTTP path labels every result PNG and helper code always creates `.png` names. In the new implementation detect or normalize actual bytes, then keep media filename, relationship target, MIME metadata, and `[Content_Types].xml` consistent. Treat failed fetches as an explicit render error or a documented placeholder; avoid producing broken binary parts silently.

## DOCX picture placeholders

The legacy convention places the image expression in a picture's alternative-text description. After Carbone interpolation, `wp:docPr/@descr` contains a descriptor or URL. The postprocessor finds the nearby `a:blip/@r:embed`, creates a media part, clones/creates a relationship, and replaces the embed reference.

Preserve these relationships as a unit:

```text
word/document.xml: a:blip r:embed="rIdImage"
word/_rels/document.xml.rels: Id="rIdImage", Target="media/image.png"
word/media/image.png: actual PNG bytes
[Content_Types].xml: compatible image content type
```

Use collision-free relationship IDs within each part. Repeated rows may initially share the same embed ID: distinct resolved images need distinct targets, while equal descriptors may reuse bytes within the request. Preserve existing static pictures and size/crop settings. Close XML DOM resources when the library requires it and parse Office parts as XML, not HTML.

The inspected handler processes only `word/document.xml` and its relationship table. Header/footer images, text boxes in other parts, and multiple part-specific relationship tables require explicit support. Do not promise them from the main-document algorithm. Missing original relationships should produce a useful error or a correct new relationship rather than a document with dangling IDs.

## XLSX cell images

Excel in-cell images can live in rich-data metadata rather than ordinary drawing anchors. The legacy preprocessor reads `xl/richData/rdrichvalue.xml` and `rdrichvaluestructure.xml`, locates worksheet cells with `vm`, and moves a template expression from the rich value into an inline `<t>` marked `nocobaseRichData`. This makes the expression visible to Carbone's normal XML builder and row repetition.

After interpolation, the postprocessor resolves each marked expression, appends media and rich-data entries, and restores a worksheet cell with the right `vm`. Relevant parts include `xl/metadata.xml`, `xl/richData/richValueRel.xml`, its `.rels`, and the rich value data/structure files. Preserve existing entries and update counts, references, and content types together.

Index bases differ: worksheet `vm` is one-based, while rich-value and relationship array indexes can be zero-based. Follow the actual XML reference chain rather than deriving every index from the count of new images. Repeated images, existing static images, multiple worksheets, and non-template rich cells all need fixtures. Remove temporary `nocobaseRichData` markers from the final document.

The old preprocessor deliberately leaves cells without a `{d...}` expression unchanged, including literal URLs in rich-data values. Keep that behavior unless the App explicitly offers remote-image conversion for such cells. Sheets without rich-data files are a normal case, not a reason to manufacture incomplete metadata. If adding cell images to those files, create the whole valid part graph deliberately.

Floating drawing images and WPS-specific representations are separate compatibility branches. A rich-data implementation alone does not cover every spreadsheet image format. Verify Excel/WPS/LibreOffice behavior only for viewers the user needs.

## DOCX-to-PDF East Asian spacing

The legacy regression concerns paragraphs that explicitly disable Latin/East Asian automatic spacing using direct paragraph property `w:autoSpaceDE` with `w:val` equal to `0`, `false`, or `off`. Its PDF-only postprocessor inserts U+2060 WORD JOINER at adjacent Latin/East Asian script boundaries, including text split across runs. Existing joiners are preserved without duplication.

The traversal resets at tabs, breaks, drawings, and objects; it does not join across paragraphs or alter paragraphs with automatic spacing enabled. The character rule covers Han, Hiragana, Katakana, Hangul, and Bopomofo against Latin; it is not a blanket rule for numbers or all punctuation. Inherited style settings are outside the inspected direct-property detector.

Apply this compatibility workaround only when the selected converter reproduces the defect, retain its narrow conditions and PDF-only scope, and test text extraction as well as appearance. Do not insert invisible characters throughout all source documents.

## Conversion lifecycle

The old converter writes an intermediate document, invokes the converter, reads the output into a Buffer unless file mode was requested, and removes intermediate/output files. Rebuild this with per-job safe paths and cleanup on success, failure, cancellation, and timeout. Keep cleanup failures from masking the primary conversion error.

Verify installed fonts, fallback behavior, page size, margins, table pagination, and image resolution using the final deployment converter. A structurally valid DOCX/XLSX is not evidence that the converted PDF preserves the layout.
