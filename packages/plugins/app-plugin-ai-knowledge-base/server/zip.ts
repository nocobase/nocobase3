/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import yauzl from 'yauzl';
import path from 'node:path';

export interface ZipEntryFile {
  name: string;
  bytes: Uint8Array;
}

export async function extractZipFiles(
  bytes: Uint8Array,
): Promise<ZipEntryFile[]> {
  const zip = await new Promise<yauzl.ZipFile>((resolve, reject) => {
    yauzl.fromBuffer(
      Buffer.from(bytes),
      { lazyEntries: true, decodeStrings: true },
      (error, file) => {
        if (error || !file)
          reject(error ?? new Error('Unable to open ZIP archive'));
        else resolve(file);
      },
    );
  });
  return await new Promise<ZipEntryFile[]>((resolve, reject) => {
    const files: ZipEntryFile[] = [];
    zip.on('error', reject);
    zip.on('end', () => resolve(files));
    zip.on('entry', (entry) => {
      const name = entry.fileName.replace(/\\/g, '/');
      if (/\/$/.test(name) || name.split('/').includes('..')) {
        zip.readEntry();
        return;
      }
      zip.openReadStream(entry, (error, stream) => {
        if (error || !stream) {
          reject(error ?? new Error(`Unable to read ZIP entry ${name}`));
          return;
        }
        const chunks: Buffer[] = [];
        stream.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
        stream.on('error', reject);
        stream.on('end', () => {
          files.push({
            name: path.basename(name),
            bytes: Buffer.concat(chunks),
          });
          zip.readEntry();
        });
      });
    });
    zip.readEntry();
  });
}
