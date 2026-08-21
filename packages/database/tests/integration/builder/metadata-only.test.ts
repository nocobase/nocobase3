import { expect, it } from "vitest";
import { describeIntegrationDatabases } from "../helpers.js";

describeIntegrationDatabases("metadata-only updates", (context) => {
  it("updates metadata without changing database schema", async () => {
    await context.builder.createCollection("orders", (collection) => {
      collection.increments("id");
      collection.decimal("amount", { precision: 12, scale: 2 });
    });

    await context.builder.updateCollectionMetadata("orders", {
      title: "Orders",
      description: "Customer purchase orders.",
      fields: {
        amount: {
          title: "Amount",
          description: "Total order amount before refunds.",
        },
      },
    });

    expect(
      await context.db.schema.hasColumn(context.table("orders"), "title"),
    ).toBe(false);

    const collection = await context.metadataStore.getCollection("orders");
    expect(collection).toMatchObject({
      title: "Orders",
    });
    expect(
      collection?.fields?.find((field) => field.name === "amount"),
    ).toMatchObject({
      name: "amount",
      title: "Amount",
      description: "Total order amount before refunds.",
    });
  });
});
