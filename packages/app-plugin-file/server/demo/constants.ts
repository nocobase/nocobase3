export interface FileDemoCollections {
  readonly profiles: string;
  readonly profileAvatars: string;
  readonly orders: string;
  readonly orderAttachments: string;
}

export interface FileDemoProfile {
  readonly id: number;
  readonly name: string;
}

export interface FileDemoOrder {
  readonly id: number;
  readonly number: string;
}

export interface FileDemoFile {
  readonly id: string;
  readonly key: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly size: number;
  readonly public: boolean;
}

export const FILE_DEMO_COLLECTIONS: Readonly<FileDemoCollections> =
  Object.freeze({
    profiles: 'fileDemoProfiles',
    profileAvatars: 'fileDemoProfileAvatars',
    orders: 'fileDemoOrders',
    orderAttachments: 'fileDemoOrderAttachments',
  });

export const FILE_DEMO_PROFILE: Readonly<FileDemoProfile> = Object.freeze({
  id: 1,
  name: 'Demo Profile',
});

export const FILE_DEMO_ORDER: Readonly<FileDemoOrder> = Object.freeze({
  id: 1,
  number: 'PO-DEMO-001',
});

export const FILE_DEMO_AVATAR: Readonly<FileDemoFile> = Object.freeze({
  id: 'file-demo-avatar',
  key: 'file-demo/profile/avatar.png',
  filename: 'avatar.png',
  mimeType: 'image/png',
  size: 68,
  public: false,
});

export const FILE_DEMO_PUBLIC_ATTACHMENT: Readonly<FileDemoFile> =
  Object.freeze({
    id: 'file-demo-public-note',
    key: 'file-demo/orders/public-note.txt',
    filename: 'public-note.txt',
    mimeType: 'text/plain',
    size: 39,
    public: true,
  });

export const FILE_DEMO_PRIVATE_ATTACHMENT: Readonly<FileDemoFile> =
  Object.freeze({
    id: 'file-demo-private-document',
    key: 'file-demo/orders/private-document.json',
    filename: 'private-document.json',
    mimeType: 'application/json',
    size: 54,
    public: false,
  });

export const FILE_DEMO_SEEDED_AT: string = '2026-08-27 00:00:00.000';
