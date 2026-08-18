import type { FileObject } from "@nocobase/portal-sdk/files";
export const isUnsafeInlineFile = (file: Pick<FileObject, "contentType" | "originalName">) => /^(text\/html|application\/xml|text\/xml|image\/svg\+xml)$/i.test(file.contentType) || /\.(html?|xml|svg)$/i.test(file.originalName);
