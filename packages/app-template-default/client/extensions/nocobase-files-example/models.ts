export type AvatarModel = { avatar_file_id: string | null };
export type TaskAttachment = { id: string; task_id: string; file_id: string; sort: number; description: string };
export type DocumentModel = { id: string; file_id: string; folder_id: string | null; title: string; tags_json: string; created_by: string };
export type FolderModel = { id: string; parent_id: string | null; name: string };
export type DocumentVersion = { id: string; document_id: string; file_id: string; version: number; created_at: string };

// Wrong: record.attachmentUrl = temporaryUrl;
// Correct: record.attachmentFileId = file.id;
