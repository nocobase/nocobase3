// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readUploadConfig } from '../server/routes/release-upload.js';

async function* chunks(parts: Uint8Array[]) {
  yield* parts;
}

describe('configuration upload framing', () => {
  it('decodes split UTF-8 configuration and leaves the archive streaming', async () => {
    const config = Buffer.from('name: 客户\n');
    const source = chunks([
      config.subarray(0, 8),
      Buffer.concat([config.subarray(8), Buffer.from('archive-')]),
      Buffer.from('tail'),
    ]);
    const prefix = await readUploadConfig(source, config.byteLength);
    expect(prefix.content).toBe('name: 客户\n');
    expect(Buffer.from(prefix.remainder).toString()).toBe('archive-');
    expect(Buffer.from((await source.next()).value!).toString()).toBe('tail');
  });

  it('rejects truncated configuration and malformed UTF-8', async () => {
    await expect(
      readUploadConfig(chunks([Buffer.from('a')]), 2),
    ).rejects.toMatchObject({ code: 'INVALID_CONFIG_UPLOAD' });
    await expect(
      readUploadConfig(chunks([new Uint8Array([255])]), 1),
    ).rejects.toMatchObject({ code: 'INVALID_CONFIG_UPLOAD' });
  });
});
