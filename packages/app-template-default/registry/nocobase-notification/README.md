# NocoBase Notification

Notification registry components are grouped by product feature:

- `logs/` renders Delivery state and sequential Provider Attempts, and provides an authenticated test-send dialog for Email and In-app channels.
- `in-app/` renders the current user's message center and unread count.
- `extension.tsx` contributes the menu and routes.

The registry contains client components only. Notification orchestration, storage, Channel factories, and Providers remain in the server packages.
