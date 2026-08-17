export const SIGNATURE_ATTR = "data-mail-signature";

export function createSignatureId() {
  return `sig-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function stripSignature(html: string): string {
  if (!html) return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.body.querySelectorAll(`[${SIGNATURE_ATTR}]`).forEach((el) => el.remove());
  return doc.body.innerHTML;
}

function wrapSignature(content: string): string {
  return `<div ${SIGNATURE_ATTR}="true" style="margin-top:16px;padding-top:12px;border-top:1px solid #e4e4e7">${content}</div>`;
}

export function applySignature(
  html: string,
  signatureContent: string | null | undefined
): string {
  const base = stripSignature(html);
  if (!signatureContent) return base;
  return `${base}${wrapSignature(signatureContent)}`;
}
