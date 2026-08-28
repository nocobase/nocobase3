import type { EnsureFileObjectInput } from '../file-storage.js';
import {
  FILE_DEMO_AVATAR,
  FILE_DEMO_PRIVATE_ATTACHMENT,
  FILE_DEMO_PUBLIC_ATTACHMENT,
  type FileDemoFile,
} from './constants.js';

const AVATAR_CONTENT =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" fill="#176b87"/><circle cx="48" cy="36" r="18" fill="white"/><path d="M18 88c4-20 16-30 30-30s26 10 30 30" fill="white"/></svg>\n<!-- demo-profile -->';
const PUBLIC_ATTACHMENT_CONTENT = 'Public demo attachment for PO-DEMO-001.';
const PRIVATE_ATTACHMENT_CONTENT =
  '{"order":"PO-DEMO-001","visibility":"private","id":1}\n';

export interface FileDemoFixture extends EnsureFileObjectInput {
  readonly id: string;
  readonly filename: string;
  readonly public: boolean;
  readonly table: string;
  readonly scope: Readonly<Record<string, number>>;
  readonly size: number;
  readonly content: string;
}

export const FILE_DEMO_FIXTURES: readonly FileDemoFixture[] = Object.freeze([
  createFixture(FILE_DEMO_AVATAR, AVATAR_CONTENT, 'fileDemoProfileAvatars', {
    profileId: 1,
  }),
  createFixture(
    FILE_DEMO_PUBLIC_ATTACHMENT,
    PUBLIC_ATTACHMENT_CONTENT,
    'fileDemoOrderAttachments',
    { orderId: 1 },
  ),
  createFixture(
    FILE_DEMO_PRIVATE_ATTACHMENT,
    PRIVATE_ATTACHMENT_CONTENT,
    'fileDemoOrderAttachments',
    { orderId: 1 },
  ),
]);

function createFixture(
  file: Readonly<FileDemoFile>,
  content: string,
  table: string,
  scope: Readonly<Record<string, number>>,
): FileDemoFixture {
  const size = Buffer.byteLength(content);
  if (size !== file.size) {
    throw new Error(
      `Demo fixture "${file.filename}" must contain ${file.size} bytes.`,
    );
  }
  return Object.freeze({
    id: file.id,
    key: file.key,
    filename: file.filename,
    mimeType: file.mimeType,
    public: file.public,
    table,
    scope,
    size,
    content,
  });
}
