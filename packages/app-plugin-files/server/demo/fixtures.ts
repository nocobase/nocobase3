import type { EnsureFileObjectInput } from '../types.js';
import {
  FILES_DEMO_AVATAR,
  FILES_DEMO_PRIVATE_ATTACHMENT,
  FILES_DEMO_PUBLIC_ATTACHMENT,
  type FilesDemoFile,
} from './constants.js';

const AVATAR_CONTENT =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" fill="#176b87"/><circle cx="48" cy="36" r="18" fill="white"/><path d="M18 88c4-20 16-30 30-30s26 10 30 30" fill="white"/></svg>\n<!-- demo-profile -->';
const PUBLIC_ATTACHMENT_CONTENT = 'Public demo attachment for PO-DEMO-001.';
const PRIVATE_ATTACHMENT_CONTENT =
  '{"order":"PO-DEMO-001","visibility":"private","id":1}\n';

export interface FilesDemoFixture extends EnsureFileObjectInput {
  readonly disk: string;
  readonly size: number;
  readonly content: string;
}

export const FILES_DEMO_FIXTURES: readonly FilesDemoFixture[] = Object.freeze([
  createFixture(FILES_DEMO_AVATAR, AVATAR_CONTENT),
  createFixture(FILES_DEMO_PUBLIC_ATTACHMENT, PUBLIC_ATTACHMENT_CONTENT),
  createFixture(FILES_DEMO_PRIVATE_ATTACHMENT, PRIVATE_ATTACHMENT_CONTENT),
]);

function createFixture(
  file: Readonly<FilesDemoFile>,
  content: string,
): FilesDemoFixture {
  const size = Buffer.byteLength(content);
  if (size !== file.size) {
    throw new Error(
      `Demo fixture "${file.filename}" must contain ${file.size} bytes.`,
    );
  }
  return Object.freeze({
    disk: file.disk,
    key: file.key,
    filename: file.filename,
    mimeType: file.mimeType,
    size,
    content,
  });
}
