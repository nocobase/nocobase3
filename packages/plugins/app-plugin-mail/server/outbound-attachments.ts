import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';

import type {
  MailOutboundAttachment,
  MailOutboundAttachmentStorage,
  MailOutboundAttachmentView,
  MailStore,
  MailUploadAttachmentInput,
} from './types.js';

const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024;

interface MailAttachmentDisk {
  putStream(
    key: string,
    stream: Readable,
    options: { contentType: string; contentLength: number },
  ): Promise<void>;
  getStream(key: string): Promise<Readable>;
  delete(key: string): Promise<void>;
}

interface MailAttachmentDriveManager {
  use(diskName: string): MailAttachmentDisk;
}

export class DriveMailOutboundAttachmentStorage implements MailOutboundAttachmentStorage {
  public constructor(
    private readonly store: MailStore,
    private readonly drive: MailAttachmentDriveManager,
    private readonly diskName: string,
  ) {}

  public async create(
    userId: string,
    input: MailUploadAttachmentInput,
  ): Promise<MailOutboundAttachmentView> {
    if (!Number.isSafeInteger(input.size) || input.size < 0) {
      throw new TypeError('Mail attachment size is invalid.');
    }
    if (input.size > MAX_ATTACHMENT_SIZE) {
      throw new TypeError('Mail attachments must not exceed 25 MB.');
    }
    const id = randomUUID();
    const fileName = safeFileName(input.fileName);
    const key = `mail/outbound/${id}`;
    const disk = this.drive.use(this.diskName);
    await disk.putStream(
      key,
      Readable.fromWeb(
        input.stream as import('node:stream/web').ReadableStream<Uint8Array>,
      ),
      {
        contentType: input.contentType,
        contentLength: input.size,
      },
    );
    const now = new Date();
    const attachment = {
      id,
      userId,
      disk: this.diskName,
      key,
      fileName,
      contentType: input.contentType || 'application/octet-stream',
      size: input.size,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1_000).toISOString(),
    };
    try {
      await this.store.createOutboundAttachment(attachment);
    } catch (error) {
      await disk.delete(key).catch(() => undefined);
      throw error;
    }
    return attachment;
  }

  public async open(
    userId: string,
    attachmentId: string,
  ): Promise<{
    readonly attachment: MailOutboundAttachment;
    readonly stream: ReadableStream<Uint8Array>;
  }> {
    const attachment = await this.store.getOutboundAttachment(
      userId,
      attachmentId,
    );
    if (!attachment) throw new Error('Mail outbound attachment was not found.');
    const stream = await this.drive
      .use(attachment.disk)
      .getStream(attachment.key);
    return {
      attachment,
      stream: Readable.toWeb(stream) as ReadableStream<Uint8Array>,
    };
  }

  public async cleanupExpired(now: string): Promise<number> {
    const attachments = await this.store.listExpiredOutboundAttachments(
      now,
      100,
    );
    let deleted = 0;
    for (const attachment of attachments) {
      await this.drive
        .use(attachment.disk)
        .delete(attachment.key)
        .catch(() => undefined);
      if (await this.store.deleteOutboundAttachment(attachment.id))
        deleted += 1;
    }
    return deleted;
  }
}

function safeFileName(value: string): string {
  const name = value.trim().replace(/[\\/\0\r\n]/gu, '_');
  if (!name) throw new TypeError('Mail attachment filename is required.');
  return name.slice(0, 500);
}
