---
'@nocobase/ai-employee': patch
---

Send a PDF to Ollama as extracted text

The Ollama provider inherited the default attachment handling, which sends a PDF to the model as a `file` content block. The Ollama client converts only text and images and throws on anything else, so dropping a PDF into an Ollama conversation failed the whole turn. Ollama now sends images as content blocks and routes documents through the document loader, as DeepSeek does.
