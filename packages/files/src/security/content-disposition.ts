const controls = /[\u0000-\u001f\u007f]/g;

export function contentDisposition(disposition: "inline" | "attachment", originalName: string): string {
  const name = originalName.replace(controls, "").replaceAll("\\", "/").split("/").pop() || "download";
  const fallback = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_") || "download";
  const encoded = encodeURIComponent(name).replace(/[!'()*]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
