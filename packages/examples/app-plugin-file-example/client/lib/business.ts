import type { ApiClient, RemoteRepository } from '@nocobase/app-client';
import type { FileRecord } from '@nocobase/app-plugin-file/client';

export interface ProfileRecord {
  readonly id: string;
  readonly name: string;
  readonly jobTitle: string;
}

export type OrderStatus = 'draft' | 'submitted' | 'archived';

export interface OrderRecord {
  readonly id: string;
  readonly number: string;
  readonly customerName: string;
  readonly status: OrderStatus;
  readonly amountCents: number;
}

/** File records returned by the business file repositories carry the FK. */
export interface BusinessFileRecord extends FileRecord {
  readonly profileId?: string | null;
  readonly orderId?: string | null;
}

export type MutationValues = Record<
  string,
  | string
  | number
  | {
      readonly connect:
        { readonly id: string } | readonly { readonly id: string }[];
    }
  | { readonly disconnect: true | readonly { readonly id: string }[] }
>;

export const resources = {
  profiles: 'fileExampleProfiles',
  orders: 'fileExampleOrders',
  profileAvatars: 'profileAvatars',
  orderAttachments: 'orderAttachments',
} as const;

export type BusinessRepository<TRecord extends object> = RemoteRepository<
  TRecord,
  MutationValues,
  MutationValues
>;

export function profilesRepository(
  api: ApiClient,
): BusinessRepository<ProfileRecord> {
  return api.repository<ProfileRecord, MutationValues, MutationValues>(
    resources.profiles,
  );
}

export function ordersRepository(
  api: ApiClient,
): BusinessRepository<OrderRecord> {
  return api.repository<OrderRecord, MutationValues, MutationValues>(
    resources.orders,
  );
}
