export async function encodeReadableStream(
  stream: NodeJS.ReadableStream | import('node:stream').Readable,
): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('base64');
}
