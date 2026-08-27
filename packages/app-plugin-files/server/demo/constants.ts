export interface FilesDemoCollections {
  readonly profiles: string;
  readonly profileAvatars: string;
  readonly orders: string;
  readonly orderAttachments: string;
}

export interface FilesDemoProfile {
  readonly id: number;
  readonly name: string;
}

export interface FilesDemoOrder {
  readonly id: number;
  readonly number: string;
}

export interface FilesDemoFile {
  readonly id: string;
  readonly disk: string;
  readonly key: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly size: number;
  readonly public: boolean;
}

export const FILES_DEMO_COLLECTIONS: Readonly<FilesDemoCollections> =
  Object.freeze({
    profiles: 'filesDemoProfiles',
    profileAvatars: 'filesDemoProfileAvatars',
    orders: 'filesDemoOrders',
    orderAttachments: 'filesDemoOrderAttachments',
  });

export const FILES_DEMO_PROFILE: Readonly<FilesDemoProfile> = Object.freeze({
  id: 1,
  name: 'Demo Profile',
});

export const FILES_DEMO_ORDER: Readonly<FilesDemoOrder> = Object.freeze({
  id: 1,
  number: 'PO-DEMO-001',
});

export const FILES_DEMO_AVATAR: Readonly<FilesDemoFile> = Object.freeze({
  id: 'files-demo-avatar',
  disk: 'local',
  key: 'files-demo/profile/avatar.svg',
  filename: 'avatar.svg',
  mimeType: 'image/svg+xml',
  size: 238,
  public: false,
});

export const FILES_DEMO_PUBLIC_ATTACHMENT: Readonly<FilesDemoFile> =
  Object.freeze({
    id: 'files-demo-public-note',
    disk: 'local',
    key: 'files-demo/orders/public-note.txt',
    filename: 'public-note.txt',
    mimeType: 'text/plain',
    size: 39,
    public: true,
  });

export const FILES_DEMO_PRIVATE_ATTACHMENT: Readonly<FilesDemoFile> =
  Object.freeze({
    id: 'files-demo-private-document',
    disk: 'local',
    key: 'files-demo/orders/private-document.json',
    filename: 'private-document.json',
    mimeType: 'application/json',
    size: 54,
    public: false,
  });

export const FILES_DEMO_SEEDED_AT: string = '2026-08-27 00:00:00.000';
