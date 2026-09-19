import { HubError } from '../services/hub.js';

export const MAX_CONFIG_SIZE: number = 1024 * 1024;
export const CONFIG_UPLOAD_TYPE: string =
  'application/vnd.nocobase.release-upload.v1';

/** Read only the bounded configuration prefix; keep the remaining archive streaming. */
export async function readUploadConfig(
  source: AsyncIterator<Uint8Array>,
  length: number,
): Promise<{ content: string; remainder: Uint8Array }> {
  const config = new Uint8Array(length);
  let offset = 0;
  let remainder: Uint8Array = new Uint8Array(0);
  while (offset < length) {
    const chunk = await source.next();
    if (chunk.done)
      throw new HubError(
        'Incomplete configuration body.',
        'INVALID_CONFIG_UPLOAD',
        400,
      );
    const count = Math.min(chunk.value.byteLength, length - offset);
    config.set(chunk.value.subarray(0, count), offset);
    offset += count;
    if (count < chunk.value.byteLength) remainder = chunk.value.subarray(count);
  }
  try {
    return {
      content: new TextDecoder('utf-8', { fatal: true }).decode(config),
      remainder,
    };
  } catch {
    throw new HubError(
      'Configuration must be valid UTF-8.',
      'INVALID_CONFIG_UPLOAD',
      400,
    );
  }
}
