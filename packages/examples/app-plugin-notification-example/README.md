# @nocobase/app-plugin-notification-example

This example demonstrates a small business workflow around task assignment and in-app notifications.

Create a task, select an application user as the assignee, and send a notification containing the task summary. The recipient can open the notification, view the task details, and update the task. Successful updates notify related people other than the current editor; when the assignee changes, both the previous and new assignees receive the follow-up notification.

The example uses the built-in `in-app` notification Channel and does not require external email or IM credentials.
