import { describe, expect, it } from "vitest";
import { DefaultNamingStrategy, snakeCase } from "../../../src/index.js";

describe("DefaultNamingStrategy", () => {
  it("normalizes collection and field names to database identifiers", () => {
    const naming = new DefaultNamingStrategy();

    expect(snakeCase("salesOrders")).toBe("sales_orders");
    expect(snakeCase("Sales Orders")).toBe("sales_orders");
    expect(snakeCase("sales-orders")).toBe("sales_orders");
    expect(naming.collectionToTableName("orderItems")).toBe("order_items");
    expect(naming.fieldToColumnName("customerEmail")).toBe("customer_email");
    expect(naming.relationForeignKey("customer")).toBe("customer_id");
    expect(naming.indexName("orders", ["customer_id", "status"])).toBe(
      "idx_orders_customer_id_status",
    );
    expect(naming.foreignKeyName("orders", ["customer_id"], "customers")).toBe(
      "fk_orders_customer_id_customers",
    );
  });

  it("supports explicit naming options for table prefix and non-underscored identifiers", () => {
    const prefixed = new DefaultNamingStrategy({
      underscored: true,
      tablePrefix: "tbl_",
    });
    const plain = new DefaultNamingStrategy({
      underscored: false,
      tablePrefix: "tbl_",
    });

    expect(prefixed.collectionToTableName("orderItems")).toBe(
      "tbl_order_items",
    );
    expect(prefixed.fieldToColumnName("createdAt")).toBe("created_at");
    expect(prefixed.fieldToColumnName("created_at")).toBe("created_at");
    expect(plain.collectionToTableName("orderItems")).toBe("tbl_orderItems");
    expect(plain.fieldToColumnName("createdAt")).toBe("createdAt");
  });

  it("truncates generated index and foreign key names with a stable hash", () => {
    const naming = new DefaultNamingStrategy();
    const indexName = naming.indexName(
      "cbt_123456_abcdef_very_long_order_items_table",
      ["very_long_customer_identifier_column", "very_long_status_column"],
    );
    const foreignKeyName = naming.foreignKeyName(
      "cbt_123456_abcdef_very_long_order_items_table",
      ["very_long_customer_identifier_column"],
      "cbt_123456_abcdef_very_long_customers_table",
    );

    expect(indexName.length).toBeLessThanOrEqual(63);
    expect(foreignKeyName.length).toBeLessThanOrEqual(63);
    expect(indexName).toMatch(
      /^idx_cbt_123456_abcdef_very_long_order_items_table/,
    );
    expect(foreignKeyName).toMatch(
      /^fk_cbt_123456_abcdef_very_long_order_items_table/,
    );
    expect(indexName).toBe(
      naming.indexName("cbt_123456_abcdef_very_long_order_items_table", [
        "very_long_customer_identifier_column",
        "very_long_status_column",
      ]),
    );
  });
});
