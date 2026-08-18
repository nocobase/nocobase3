# NocoBase File Preview

Editable, conservative preview for `fileId` or `FileObject`. It creates a short-lived URL only after the user opens the preview and keeps that URL in memory. JPEG/PNG/WebP/GIF render as images; audio and video use native controls. PDF, text, SVG, HTML, JavaScript, and unknown types never render active content and offer open/download actions.

Persist only `fileId`; never store the temporary URL. Pass `policy` and `context` when your authorization model needs them. The component uses `@nocobase/portal-sdk/files`, has no server package dependency, and is safe to edit after installation.
