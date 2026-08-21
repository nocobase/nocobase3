import { describe, expect, it } from "vitest";
import { CollectionBuilder } from "../../../src/index.js";
import { InMemoryCollectionMetadataStore } from "../../../src/index.js";

describe("CollectionBuilder renameCollection", () => {
  it("renames collection metadata only by default and freezes the old effective table name", async () => {
    const metadataStore = new InMemoryCollectionMetadataStore();
    const builder = new CollectionBuilder({
      metadataStore,
      naming: {
        underscored: true,
        tablePrefix: "tbl_",
      },
    });

    await builder.createCollection("orderItems", {
      title: "Order items",
      fields: [
        { name: "id", type: "increments", primaryKey: true },
        { name: "orderNo", type: "string", title: "Order number" },
      ],
    });

    const result = await builder.renameCollection("orderItems", "orderLines");

    expect(result.operations).toEqual([
      {
        type: "renameCollection",
        from: "orderItems",
        to: "orderLines",
        renameTable: undefined,
        renameTableTo: undefined,
      },
    ]);
    expect(result.schemaOperations).toEqual([]);
    expect(await metadataStore.getCollection("orderItems")).toBeUndefined();
    expect(await metadataStore.getCollection("orderLines")).toMatchObject({
      name: "orderLines",
      tableName: "tbl_order_items",
      title: "Order items",
      fields: [
        { name: "id", type: "increments" },
        { name: "orderNo", title: "Order number" },
      ],
    });
  });

  it("renames the backing table by convention when requested", async () => {
    const builder = new CollectionBuilder({
      naming: {
        underscored: true,
        tablePrefix: "tbl_",
      },
    });

    const result = await builder.renameCollection("orderItems", "orderLines", {
      renameTable: true,
      dryRun: true,
    });

    expect(result.operations).toEqual([
      {
        type: "renameCollection",
        from: "orderItems",
        to: "orderLines",
        renameTable: true,
        renameTableTo: undefined,
      },
    ]);
    expect(result.schemaOperations).toEqual([
      {
        type: "renameTable",
        from: "tbl_order_items",
        to: "tbl_order_lines",
      },
    ]);
  });

  it("renames the backing table to an explicit physical table name", async () => {
    const metadataStore = new InMemoryCollectionMetadataStore();
    const builder = new CollectionBuilder({ metadataStore });

    await builder.createCollection("orderItems", {
      tableName: "legacy_order_item",
      fields: [{ name: "id", type: "increments", primaryKey: true }],
    });

    const result = await builder.renameCollection("orderItems", "orderLines", {
      renameTableTo: "legacy_order_line",
    });

    expect(result.schemaOperations).toEqual([
      {
        type: "renameTable",
        from: "legacy_order_item",
        to: "legacy_order_line",
      },
    ]);
    expect(await metadataStore.getCollection("orderLines")).toMatchObject({
      name: "orderLines",
      tableName: "legacy_order_line",
    });
  });
});
