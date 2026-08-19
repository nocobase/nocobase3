import { defineMigration } from "@nocobase/database";

export default defineMigration({
  name: "202608190002_add_notification_admin_indexes",

  async up({ builder }) {
    await builder.addIndex("notificationDeliveries", {
      fields: ["status", "updatedAt", "id"],
      name: "notification_deliveries_status_updated_idx",
    });
    await builder.addIndex("notificationDeliveries", {
      fields: ["channel", "updatedAt", "id"],
      name: "notification_deliveries_channel_updated_idx",
    });
    await builder.addIndex("notificationDeliveries", {
      fields: ["updatedAt", "id"],
      name: "notification_deliveries_updated_idx",
    });
    await builder.addIndex("notificationDeliveries", {
      fields: ["notificationId"],
      name: "notification_deliveries_notification_idx",
    });
    await builder.addIndex("notificationDeliveries", {
      fields: ["recipientKey"],
      name: "notification_deliveries_recipient_idx",
    });
  },

  async down({ builder }) {
    await builder.dropIndex(
      "notificationDeliveries",
      "notification_deliveries_recipient_idx"
    );
    await builder.dropIndex(
      "notificationDeliveries",
      "notification_deliveries_notification_idx"
    );
    await builder.dropIndex(
      "notificationDeliveries",
      "notification_deliveries_updated_idx"
    );
    await builder.dropIndex(
      "notificationDeliveries",
      "notification_deliveries_channel_updated_idx"
    );
    await builder.dropIndex(
      "notificationDeliveries",
      "notification_deliveries_status_updated_idx"
    );
  },
});
