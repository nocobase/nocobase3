import { mkdtemp, open, rm, type FileHandle } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deserialize, serialize } from 'node:v8';
import type { RepositoryRecord } from '../types.js';

/** Private disk buffering preserves driver value types without retaining all roots in memory. */
export async function* spoolRows(
  source: AsyncIterable<RepositoryRecord>,
  reverse: boolean,
): AsyncGenerator<RepositoryRecord> {
  const directory = await mkdtemp(join(tmpdir(), 'nocobase-repository-'));
  let file: FileHandle | undefined;
  try {
    file = await open(join(directory, 'rows'), 'wx+', 0o600);
    let size = 0;
    for await (const row of source) {
      const data = serialize(row);
      const length = Buffer.alloc(4);
      length.writeUInt32BE(data.length);
      for (const part of [length, data, length]) {
        let written = 0;
        while (written < part.length) {
          const result = await file.write(
            part,
            written,
            part.length - written,
            size,
          );
          if (result.bytesWritten === 0)
            throw new Error('Unable to write Repository row buffer.');
          written += result.bytesWritten;
          size += result.bytesWritten;
        }
      }
    }
    let position = reverse ? size : 0;
    while (reverse ? position > 0 : position < size) {
      const length = Buffer.alloc(4);
      await readExact(file, length, reverse ? position - 4 : position);
      const bytes = length.readUInt32BE();
      const start = reverse ? position - bytes - 4 : position + 4;
      const data = Buffer.alloc(bytes);
      await readExact(file, data, start);
      position = reverse ? start - 4 : start + bytes + 4;
      yield deserialize(data) as RepositoryRecord;
    }
  } finally {
    try {
      await file?.close();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}

async function readExact(
  file: FileHandle,
  buffer: Buffer,
  position: number,
): Promise<void> {
  let read = 0;
  while (read < buffer.length) {
    const result = await file.read(
      buffer,
      read,
      buffer.length - read,
      position + read,
    );
    if (result.bytesRead === 0)
      throw new Error('Incomplete Repository row buffer.');
    read += result.bytesRead;
  }
}
