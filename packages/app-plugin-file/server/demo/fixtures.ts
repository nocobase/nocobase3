import type { EnsureFileObjectInput } from '../file-storage.js';
import {
  FILE_DEMO_AVATAR,
  FILE_DEMO_PRIVATE_ATTACHMENT,
  FILE_DEMO_PUBLIC_ATTACHMENT,
  type FileDemoFile,
} from './constants.js';

const AVATAR_CONTENT = new Uint8Array(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  ),
);
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
  readonly content: string | Uint8Array;
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
  content: string | Uint8Array,
  table: string,
  scope: Readonly<Record<string, number>>,
): FileDemoFixture {
  const size =
    typeof content === 'string'
      ? Buffer.byteLength(content)
      : content.byteLength;
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
