import { useState } from "react";
import { AttachmentField } from "@/extensions/nocobase-attachment-field";
import { FileUpload, type FileObject } from "@/extensions/nocobase-file-upload";
import { FilePreview } from "@/extensions/nocobase-file-preview";

export function FilesExample() {
  const [avatar, setAvatar] = useState<FileObject[]>([]);
  const [attachments, setAttachments] = useState<string[]>([]);
  return <main className="space-y-6 p-6"><h1>Editable Files examples</h1><section><h2>Avatar</h2><FileUpload policy="avatar" multiple={false} maxFiles={1} value={avatar} onChange={setAvatar} /><p className="text-sm text-muted-foreground">Persist the returned id as users.avatar_file_id after the business save.</p>{avatar[0] ? <FilePreview file={avatar[0]} mode="full" /> : null}</section><section><h2>Record attachments</h2><AttachmentField value={attachments} onChange={setAttachments} context={{ resource: "tasks", resourceId: "task-id", field: "attachments" }} /><p className="text-sm text-muted-foreground">The App owns task_attachments(task_id, file_id, sort, description); removing a relation does not delete the file.</p></section><section><h2>Document library</h2><p>Model documents(file_id, folder_id, title, tags_json, created_by), folders(parent_id, name), and document_versions(document_id, file_id, version, created_at) in App tables. Folders, tags, and versions are not Files Kernel APIs.</p></section></main>;
}
