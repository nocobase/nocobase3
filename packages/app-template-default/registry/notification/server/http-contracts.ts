export type NotificationHttpMethod = 'GET' | 'POST';
export type NotificationHttpAuth = 'disabled' | 'session';
export type NotificationHttpFieldLocation = 'path' | 'query' | 'body';
export type NotificationHttpFieldType = 'string' | 'integer' | 'boolean';

export interface NotificationHttpField {
  readonly name: string;
  readonly location: NotificationHttpFieldLocation;
  readonly type: NotificationHttpFieldType;
  readonly required?: boolean;
  readonly description: string;
}

export interface NotificationHttpError {
  readonly status: number;
  readonly code: string;
  readonly description: string;
}

export interface NotificationHttpRouteContract {
  readonly operationId: string;
  readonly method: NotificationHttpMethod;
  readonly path: string;
  readonly summary: string;
  readonly auth: NotificationHttpAuth;
  readonly csrf: boolean;
  readonly fields: readonly NotificationHttpField[];
  readonly requestExample?: Readonly<Record<string, string | number | boolean>>;
  readonly responseExample: Readonly<Record<string, string | number | boolean>>;
  readonly errors: readonly NotificationHttpError[];
}

export interface NotificationRoutePaths {
  readonly trigger: '/trigger';
  readonly inbox: '/inbox';
  readonly admin: '/admin';
}

export const notificationRoutePaths: NotificationRoutePaths = {
  trigger: '/trigger',
  inbox: '/inbox',
  admin: '/admin',
};

const authenticationError: NotificationHttpError = {
  status: 401,
  code: 'NOTIFICATION_INBOX_UNAUTHENTICATED',
  description: 'The request has no authenticated Portal session.',
};
const csrfError: NotificationHttpError = {
  status: 403,
  code: 'NOTIFICATION_CSRF_INVALID',
  description: 'The same-origin double-submit CSRF token is absent or invalid.',
};

export const notificationHttpRouteContracts: readonly NotificationHttpRouteContract[] = [
  {
    operationId: 'disabledNotificationTrigger', method: 'POST', path: '/api/notifications/trigger',
    summary: 'Disabled external notification trigger', auth: 'disabled', csrf: false, fields: [],
    responseExample: { code: 'HTTP_TRIGGER_DISABLED' },
    errors: [{ status: 403, code: 'HTTP_TRIGGER_DISABLED', description: 'HTTP triggering is intentionally unavailable in phase one.' }],
  },
  {
    operationId: 'issueInboxCsrf', method: 'GET', path: '/api/notifications/inbox/csrf',
    summary: 'Issue an Inbox CSRF token', auth: 'session', csrf: false, fields: [],
    responseExample: { token: '8a72e20e-…' }, errors: [authenticationError],
  },
  {
    operationId: 'listInbox', method: 'GET', path: '/api/notifications/inbox',
    summary: 'List the current user Inbox', auth: 'session', csrf: false,
    fields: [
      { name: 'channel', location: 'query', type: 'string', description: 'Optional in-app or email filter.' },
      { name: 'unreadOnly', location: 'query', type: 'boolean', description: 'Return unread items only.' },
      { name: 'limit', location: 'query', type: 'integer', description: 'Page size from 1 to 100.' },
      { name: 'cursor', location: 'query', type: 'string', description: 'Opaque stable cursor from nextCursor.' },
    ],
    responseExample: { itemId: 'item-1', itemTitle: 'Order ready', nextCursor: 'eyJjcmVhdGVkQXQiOi…' },
    errors: [authenticationError, { status: 400, code: 'NOTIFICATION_INBOX_QUERY_INVALID', description: 'A filter, page size, or cursor is invalid.' }],
  },
  {
    operationId: 'countUnreadInbox', method: 'GET', path: '/api/notifications/inbox/unread-count',
    summary: 'Count unread Inbox items', auth: 'session', csrf: false,
    fields: [{ name: 'channel', location: 'query', type: 'string', description: 'Optional in-app or email filter.' }],
    responseExample: { count: 3 }, errors: [authenticationError],
  },
  {
    operationId: 'mutateInboxItem', method: 'POST', path: '/api/notifications/inbox/{itemId}',
    summary: 'Read, unread, or delete one Inbox item', auth: 'session', csrf: true,
    fields: [
      { name: 'itemId', location: 'path', type: 'string', required: true, description: 'Inbox item ID.' },
      { name: 'action', location: 'body', type: 'string', required: true, description: 'read, unread, or delete.' },
      { name: 'expectedVersion', location: 'body', type: 'integer', required: true, description: 'Optimistic concurrency version.' },
    ],
    requestExample: { action: 'read', expectedVersion: 2 }, responseExample: { id: 'item-1', version: 3 },
    errors: [authenticationError, csrfError, { status: 404, code: 'NOTIFICATION_INBOX_ITEM_NOT_FOUND', description: 'The item is absent or belongs to another user.' }, { status: 409, code: 'NOTIFICATION_INBOX_CONFLICT', description: 'The item version changed.' }],
  },
  {
    operationId: 'markInboxRead', method: 'POST', path: '/api/notifications/inbox/read-all',
    summary: 'Mark the current Inbox read', auth: 'session', csrf: true,
    fields: [{ name: 'channel', location: 'body', type: 'string', description: 'Optional in-app or email filter.' }],
    requestExample: { channel: 'in-app' }, responseExample: { updated: 12 }, errors: [authenticationError, csrfError],
  },
  {
    operationId: 'listNotificationDeliveries', method: 'GET', path: '/api/notifications/admin/deliveries',
    summary: 'List redacted Delivery summaries', auth: 'session', csrf: false,
    fields: [
      { name: 'status', location: 'query', type: 'string', description: 'Delivery status filter.' },
      { name: 'channel', location: 'query', type: 'string', description: 'Delivery channel filter.' },
      { name: 'search', location: 'query', type: 'string', description: 'Prefix search, at most 200 characters.' },
      { name: 'page', location: 'query', type: 'integer', description: 'One-based page.' },
      { name: 'pageSize', location: 'query', type: 'integer', description: 'Page size from 1 to 100.' },
    ],
    responseExample: { deliveryId: 'delivery-1', status: 'failed', total: 1 },
    errors: [{ ...authenticationError, code: 'NOTIFICATION_ADMIN_UNAUTHENTICATED' }],
  },
  {
    operationId: 'retryNotificationDelivery', method: 'POST', path: '/api/notifications/admin/deliveries/{deliveryId}/retry',
    summary: 'Manually retry a terminal Delivery', auth: 'session', csrf: true,
    fields: [
      { name: 'deliveryId', location: 'path', type: 'string', required: true, description: 'Delivery ID.' },
      { name: 'expectedVersion', location: 'body', type: 'integer', required: true, description: 'Optimistic concurrency version.' },
      { name: 'reason', location: 'body', type: 'string', required: true, description: 'Operator audit reason.' },
      { name: 'acknowledgeDuplicateRisk', location: 'body', type: 'boolean', description: 'Required for submission_unknown.' },
    ],
    requestExample: { expectedVersion: 4, reason: 'Provider recovered', acknowledgeDuplicateRisk: true },
    responseExample: { id: 'delivery-1', status: 'queued', version: 5 },
    errors: [{ ...authenticationError, code: 'NOTIFICATION_ADMIN_UNAUTHENTICATED' }, csrfError, { status: 409, code: 'NOTIFICATION_DELIVERY_CONFLICT', description: 'The status or version changed.' }],
  },
  {
    operationId: 'listNotificationProviders', method: 'GET', path: '/api/notifications/admin/providers',
    summary: 'List redacted provider configuration', auth: 'session', csrf: false, fields: [],
    responseExample: { providerId: 'email/smtp/primary', enabled: true },
    errors: [{ ...authenticationError, code: 'NOTIFICATION_ADMIN_UNAUTHENTICATED' }],
  },
  {
    operationId: 'testNotificationProvider', method: 'POST', path: '/api/notifications/admin/providers/{providerId}/test',
    summary: 'Test provider connectivity without sending', auth: 'session', csrf: true,
    fields: [{ name: 'providerId', location: 'path', type: 'string', required: true, description: 'Provider instance ID.' }],
    requestExample: {}, responseExample: { providerId: 'email/smtp/primary', ok: true },
    errors: [{ ...authenticationError, code: 'NOTIFICATION_ADMIN_UNAUTHENTICATED' }, csrfError],
  },
];
