# Verify an implementation

Select checks for the implemented formats and branches. A text-only DOCX feature does not need a spreadsheet image suite. Run the target package's relevant lint, typecheck, tests, and build; use its database integration instructions if adding migrations. Keep fixtures under the owning package's `tests/` tree and exclude them from runtime builds.

## Small representative fixtures

| Feature                | Observable checks                                                                                                                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scalar/object template | Render Unicode, XML special characters, zero, false, null, option label/value, and a nested relation; verify the actual resulting values.                                                                           |
| Detail with child rows | Render zero, one, and several children with a real repeating table; verify rows and totals without duplicated markers.                                                                                              |
| Root array             | Render several records; verify ordering and all repetition boundaries.                                                                                                                                              |
| Record/query scope     | Test composite keys, selected IDs, a filtered page after page one, and all-filtered scope; verify exact authorized record IDs in the output.                                                                        |
| Authorization          | Anonymous render fails; denied template use fails; a second principal cannot print protected rows, fields, related records, or private attachments. Test the production route directly, not only button visibility. |
| Limits                 | Empty results, maximum rows, one above maximum, excessive child rows/images, invalid ZIP, and expansion/path violations give controlled errors.                                                                     |
| Download               | Binary bytes and MIME match the format; UTF-8 filename works; structured errors are not saved as documents.                                                                                                         |

## Image fixtures

- DOCX: two different images in a repeating row, repeated use of the same image, and an existing static logo. Verify embed IDs, relationships, media bytes, content types, and visible size. Add headers/footers only if that support is claimed.
- Attachments: allowed and denied IDs, deleted files, wrong App/source, malformed descriptors, and a recognized denied stable URL. The last case must not fall back to another resolver. Verify content URLs separately from metadata permissions.
- Remote images, when offered: missing/non-image response, redirect to a disallowed destination, timeout, oversized body, and actual PNG/JPEG handling.
- XLSX in-cell images: a template expression in rich-data metadata, a non-template cell left unchanged, repeated rows, existing rich entries/static pictures, multiple worksheets, and a sheet without rich-data metadata. Verify `vm`, metadata counts, rich-value references, relationship targets, and readable output without a repair prompt.
- QR: scan the generated code at the intended print size and verify its payload; unsupported barcode types produce an explicit error.

## PDF and deployment fixtures

Run the same template through the actual converter with the deployment's fonts. Inspect page count, clipped content, table breaks, image placement, CJK glyphs, margins, and mixed Latin/CJK spacing. For the spacing workaround, test boundaries within/across runs, disabled/enabled spacing, explicit breaks/tabs, existing joiners, and unchanged Office output when PDF conversion is off.

Exercise unavailable converter, conversion failure, timeout, and simultaneous renders. Verify temporary files are removed and request options do not leak between jobs. Start the built application from its deployed directory to prove server dependencies and fixed template assets are present.

## Inspect both structure and appearance

Unzip Office outputs in a temporary directory and parse the changed XML parts. Check expected text, relationships, content types, and image bytes; distinguish known template tags from ordinary braces when looking for unresolved markers. Open the file in the intended Office viewer and check for repair warnings. For PDF, inspect rendered pages and extracted text. A mocked Carbone call, a ZIP that merely opens, or a correct HTTP status alone cannot establish print fidelity.

Record the engine/converter versions, template revision, sample input, asserted results, and visually checked viewers. Describe unsupported or unverified combinations explicitly rather than implying cross-viewer compatibility.
