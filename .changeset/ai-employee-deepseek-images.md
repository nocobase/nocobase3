---
'@nocobase/ai-employee': patch
---

Send images to DeepSeek

`DeepSeekProvider.isApiSupportedAttachment()` returned `false` for everything, so an image never reached the model. It did not reach the document loader either — `.png` is not a document extension — so a user who dropped a screenshot into a DeepSeek conversation got a system message saying the assistant does not support parsing `image/png`, from a provider that does.

Images now go to the model as content blocks, matching every other image-capable provider. Documents keep going through the loader, where this provider's text extraction already works.
