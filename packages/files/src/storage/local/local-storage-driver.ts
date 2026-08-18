import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { lstat, link, mkdir, readFile, rm, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable, Transform } from "node:stream";
import type { LocalStorageConfig } from "./local-config.ts";
import { validateObjectKey } from "../object-key.ts";
import { StorageDriverError } from "../storage-errors.ts";
import type { StorageDriver, StorageUploadPreparation, StoredObjectStat } from "../storage-driver.ts";

type Metadata = { contentType: string; checksumSha256?: string; size: number };
export class LocalStorageDriver implements StorageDriver {
  readonly type = "local";
  private readonly root: string;
  private ready: Promise<void>;
  constructor(config: LocalStorageConfig) { this.root = path.resolve(config.root); this.ready = mkdir(this.root, { recursive: true }).then(() => undefined); }
  capabilities() { return { uploadModes: ["proxy"] as ["proxy"], externalReadTarget: false }; }
  async prepareUpload(_input: { key: string; contentType: string; size: number; checksumSha256?: string; expiresAt: Date }): Promise<StorageUploadPreparation> { await this.ready; return { mode: "proxy" }; }
  private async target(key: string) {
    validateObjectKey(key); await this.ready;
    const target = path.resolve(this.root, ...key.split("/"));
    if (target !== this.root && !target.startsWith(`${this.root}${path.sep}`)) throw new StorageDriverError("invalid-key", "invalid object key");
    const relative = path.relative(this.root, target);
    let current = this.root;
    for (const part of relative.split(path.sep)) { current = path.join(current, part); try { const info = await lstat(current); if (info.isSymbolicLink()) throw new StorageDriverError("invalid-key", "symlink path is not allowed"); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; } }
    return target;
  }
  private metadataPath(target: string) { return `${target}.metadata.json`; }
  async putObject(input: { key: string; body: ReadableStream<Uint8Array>; contentType: string; expectedSize: number; checksumSha256?: string; signal?: AbortSignal }): Promise<StoredObjectStat> {
    const target = await this.target(input.key); const parent = path.dirname(target); await mkdir(parent, { recursive: true });
    try { const info = await lstat(target); if (info.isSymbolicLink() || !info.isFile()) throw new StorageDriverError("invalid-object", "invalid object"); throw new StorageDriverError("conflict", "object already exists"); } catch (e) { if (!(e as NodeJS.ErrnoException).code || (e as StorageDriverError).code) { if (e instanceof StorageDriverError) throw e; } }
    const temp = path.join(this.root, `.tmp-${randomUUID()}`), hash = createHash("sha256"); let size = 0; let published = false;
    const meter = new Transform({ transform(chunk, _enc, cb) { size += chunk.length; hash.update(chunk); cb(null, chunk); } });
    try {
      await pipeline(Readable.fromWeb(input.body as import("node:stream/web").ReadableStream), meter, createWriteStream(temp, { flags: "wx" }), { signal: input.signal });
      const checksum = hash.digest("hex"); if (size !== input.expectedSize) throw new StorageDriverError("size-mismatch", "object size mismatch"); if (input.checksumSha256 && checksum !== input.checksumSha256) throw new StorageDriverError("checksum-mismatch", "object checksum mismatch");
      try { await link(temp, target); published = true; await unlink(temp); } catch (e) { if ((e as NodeJS.ErrnoException).code === "EEXIST") throw new StorageDriverError("conflict", "object already exists"); throw e; }
      await writeFile(this.metadataPath(target), JSON.stringify({ contentType: input.contentType, checksumSha256: checksum, size } satisfies Metadata), { flag: "wx" });
      return { size, contentType: input.contentType, checksumSha256: checksum };
    } catch (e) { await rm(temp, { force: true }).catch(() => undefined); if (published) { await rm(target, { force: true }).catch(() => undefined); await rm(this.metadataPath(target), { force: true }).catch(() => undefined); } if (e instanceof StorageDriverError) throw e; if ((e as Error).name === "AbortError") throw new StorageDriverError("aborted", "operation aborted", { cause: e }); throw new StorageDriverError("unavailable", "storage operation failed", { cause: e }); }
  }
  async statObject(input: { key: string; signal?: AbortSignal }): Promise<StoredObjectStat | null> { const target = await this.target(input.key); try { const info = await lstat(target); if (!info.isFile() || info.isSymbolicLink()) throw new StorageDriverError("invalid-object", "invalid object"); const meta = JSON.parse(await readFile(this.metadataPath(target), "utf8")) as Metadata; return meta; } catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return null; if (e instanceof StorageDriverError) throw e; throw new StorageDriverError("unavailable", "storage operation failed", { cause: e }); } }
  async openRead(input: { key: string; signal?: AbortSignal }) { const target = await this.target(input.key); const stat = await this.statObject({ key: input.key, signal: input.signal }); if (!stat) throw new StorageDriverError("not-found", "object not found"); return { body: Readable.toWeb(createReadStream(target, { signal: input.signal })) as ReadableStream<Uint8Array>, stat }; }
  async deleteObject(input: { key: string; signal?: AbortSignal }) { const target = await this.target(input.key); await unlink(target).catch((e: NodeJS.ErrnoException) => { if (e.code !== "ENOENT") throw new StorageDriverError("unavailable", "storage operation failed", { cause: e }); }); await unlink(this.metadataPath(target)).catch((e: NodeJS.ErrnoException) => { if (e.code !== "ENOENT") throw new StorageDriverError("unavailable", "storage operation failed", { cause: e }); }); }
}
