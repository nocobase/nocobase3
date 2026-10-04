---
'@nocobase/app-plugin-ai-employee': patch
---

Declare every `/api/aiEmployees` and `/api/aiEmployee` route in the application's OpenAPI document, served at `/api/swagger/docs`: each route names its summary, an `operationId` starting `aiEmployees` under the tag `AiEmployee`, its input schemas, its response schemas and the errors it answers, including `413` for oversized bodies, `415` for a non-multipart upload, `429` when too many runs are in progress and `503` when a provider cannot list its models. The streaming runs (`send`, `resend`, `resumeToolCall`, `resumeStream`) are documented as `text/event-stream` with their frame format. Input is now validated through `apiValidator()`, which answers invalid input exactly as before.
