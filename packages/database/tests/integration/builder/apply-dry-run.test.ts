import { expect, it } from "vitest";
import { describeIntegrationDatabases } from "../helpers.js";

describeIntegrationDatabases("apply and dryRun", (context) => {
  it("previews SQL without executing DDL during dryRun", async () => {
    const result = await context.builder.createCollection(
      "orders",
      {
        fields: [
          {
            name: "id",
            type: "increments",
            primaryKey: true,
          },
        ],
      },
      {
        dryRun: true,
        previewSql: true,
      },
    );

    expect(await context.db.schema.hasTable(context.table("orders"))).toBe(
      false,
    );
    expect(result.sql?.join("\n")).toContain("create table");
    expect(result.sql?.join("\n")).toContain(context.table("orders"));
  });

  it("executes batched CollectionOperation input", async () => {
    await context.builder.apply([
      {
        type: "createCollection",
        name: "orders",
        definition: {
          fields: [
            {
              name: "id",
              type: "increments",
              primaryKey: true,
            },
          ],
        },
      },
      {
        type: "addField",
        collection: "orders",
        field: {
          name: "paidAt",
          type: "datetime",
        },
      },
    ]);

    expect(await context.db.schema.hasTable(context.table("orders"))).toBe(
      true,
    );
    expect(
      await context.db.schema.hasColumn(context.table("orders"), "paid_at"),
    ).toBe(true);
  });
});
