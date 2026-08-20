import { expect, it } from "vitest";
import {
  describeIntegrationDatabases,
  type IntegrationTestContext,
} from "../helpers.js";

describeIntegrationDatabases("query joins", (context) => {
  it("supports portable joins with reference and callback conditions", async () => {
    const customersTable = context.table("queryCustomers");
    const ordersTable = context.table("queryOrders");

    await createJoinCollections(context);

    await context.database
      .query()
      .insertInto(customersTable)
      .values([
        { name: "Ada", status: "active" },
        { name: "Grace", status: "active" },
        { name: "Linus", status: "disabled" },
      ])
      .execute();
    await context.database
      .query()
      .insertInto(ordersTable)
      .values([
        { customerId: 1, orderNo: "SO-001", status: "paid" },
        { customerId: 2, orderNo: "SO-002", status: "draft" },
        { customerId: null, orderNo: "SO-003", status: "draft" },
      ])
      .execute();

    await expect(
      context.database
        .query()
        .selectFrom(`${ordersTable} as o`)
        .leftJoin(`${customersTable} as c`, "o.customerId", "c.id")
        .select([
          "o.id as order_id",
          "o.orderNo as order_no",
          "c.name as customer_name",
        ])
        .where("o.status", "in", ["paid", "draft"])
        .orderBy("o.orderNo")
        .execute(),
    ).resolves.toEqual([
      { order_id: 1, order_no: "SO-001", customer_name: "Ada" },
      { order_id: 2, order_no: "SO-002", customer_name: "Grace" },
      { order_id: 3, order_no: "SO-003", customer_name: null },
    ]);

    await expect(
      context.database
        .query()
        .selectFrom(`${ordersTable} as o`)
        .innerJoin(`${customersTable} as c`, (join) =>
          join.onRef("o.customerId", "=", "c.id").on("c.name", "like", "A%"),
        )
        .select(["o.orderNo as orderNo", "c.name as customerName"])
        .execute(),
    ).resolves.toEqual([{ orderNo: "SO-001", customerName: "Ada" }]);
  });

  it("supports rightJoin, crossJoin, and clearJoins", async () => {
    const customersTable = context.table("queryCustomers");
    const ordersTable = context.table("queryOrders");

    await createJoinCollections(context);

    await context.database
      .query()
      .insertInto(customersTable)
      .values([
        { name: "Ada", status: "active" },
        { name: "Grace", status: "active" },
        { name: "Linus", status: "disabled" },
      ])
      .execute();
    await context.database
      .query()
      .insertInto(ordersTable)
      .values([
        { customerId: 1, orderNo: "SO-001", status: "paid" },
        { customerId: 2, orderNo: "SO-002", status: "draft" },
      ])
      .execute();

    await expect(
      context.database
        .query()
        .selectFrom(`${ordersTable} as o`)
        .rightJoin(`${customersTable} as c`, "o.customerId", "c.id")
        .select(["o.orderNo as orderNo", "c.name as customerName"])
        .orderBy("c.name")
        .execute(),
    ).resolves.toEqual([
      { orderNo: "SO-001", customerName: "Ada" },
      { orderNo: "SO-002", customerName: "Grace" },
      { orderNo: null, customerName: "Linus" },
    ]);

    const crossRows = await context.database
      .query()
      .selectFrom(`${ordersTable} as o`)
      .crossJoin(`${customersTable} as c`)
      .select(["o.orderNo as orderNo", "c.name as customerName"])
      .orderBy("o.orderNo")
      .orderBy("c.name")
      .execute();
    expect(crossRows).toHaveLength(6);

    await expect(
      context.database
        .query()
        .selectFrom(`${ordersTable} as o`)
        .innerJoin(`${customersTable} as c`, "o.customerId", "c.id")
        .select("o.orderNo as orderNo")
        .clearJoins()
        .orderBy("o.orderNo")
        .pluck<string>("orderNo"),
    ).resolves.toEqual(["SO-001", "SO-002"]);
  });

  it("supports Kysely-style callback joins with grouped OR expressions", async () => {
    const customersTable = context.table("queryCustomers");
    const ordersTable = context.table("queryOrders");

    await createJoinCollections(context);

    await context.database
      .query()
      .insertInto(customersTable)
      .values([
        { name: "Ada", status: "active" },
        { name: "Grace", status: "disabled" },
        { name: "Linus", status: "active" },
      ])
      .execute();
    await context.database
      .query()
      .insertInto(ordersTable)
      .values([
        {
          customerId: 1,
          fallbackCustomerId: null,
          orderNo: "SO-001",
          status: "paid",
        },
        {
          customerId: null,
          fallbackCustomerId: 3,
          orderNo: "SO-002",
          status: "manual",
        },
        {
          customerId: null,
          fallbackCustomerId: null,
          orderNo: "SO-003",
          status: "manual",
        },
        {
          customerId: 2,
          fallbackCustomerId: null,
          orderNo: "SO-004",
          status: "manual",
        },
      ])
      .execute();

    await expect(
      context.database
        .query()
        .selectFrom(`${ordersTable} as o`)
        .leftJoin(`${customersTable} as c`, (join) =>
          join
            .on((eb) =>
              eb.or([
                eb("o.customerId", "=", eb.ref("c.id")),
                eb("o.fallbackCustomerId", "=", eb.ref("c.id")),
              ]),
            )
            .on("c.status", "=", "active"),
        )
        .select(["o.orderNo as orderNo", "c.name as customerName"])
        .orderBy("o.orderNo")
        .execute(),
    ).resolves.toEqual([
      { orderNo: "SO-001", customerName: "Ada" },
      { orderNo: "SO-002", customerName: "Linus" },
      { orderNo: "SO-003", customerName: null },
      { orderNo: "SO-004", customerName: null },
    ]);
  });
});

async function createJoinCollections(
  context: IntegrationTestContext,
): Promise<void> {
  await context.builder.createCollection("queryCustomers", (collection) => {
    collection.increments("id");
    collection.string("name");
    collection.string("status");
  });
  await context.builder.createCollection("queryOrders", (collection) => {
    collection.increments("id");
    collection.integer("customerId").nullable();
    collection.integer("fallbackCustomerId").nullable();
    collection.string("orderNo");
    collection.string("status");
  });
}
