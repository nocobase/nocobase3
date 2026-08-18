import { strict as assert } from "node:assert";
import { StorageDriver } from "../../src/storage/storage-driver.ts";
const stream = (value: string) => new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new TextEncoder().encode(value)); c.close(); } });
export async function runStorageDriverContract(create: () => Promise<StorageDriver>, local = true) {
  const driver = await create(); assert.deepEqual(driver.capabilities().uploadModes.length > 0, true);
  const key = "w/ws_1/objects/file_1"; await driver.putObject?.({ key, body: stream("hello"), contentType: "text/plain", expectedSize: 5 });
  assert.equal((await driver.statObject({ key }))?.size, 5); assert.equal((await driver.openRead?.({ key })).stat.size, 5);
  await assert.rejects(() => driver.putObject?.({ key, body: stream("x"), contentType: "text/plain", expectedSize: 1 }));
  assert.equal(await driver.statObject({ key: "missing" }), null); await driver.deleteObject({ key: "missing" }); await driver.deleteObject({ key });
  if (local) assert.equal(await driver.statObject({ key }), null);
}
