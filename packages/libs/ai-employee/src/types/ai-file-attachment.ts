export type AIFileSource = {
  dataSourceKey?: string;
  collectionName?: string;
  field?: string;
  documentCache?: boolean;
  trustworthy?: boolean;
};

export type AIFileAttachment = {
  id?: string | number;
  title?: string;
  filename?: string;
  extname?: string;
  size?: number;
  mimetype?: string;
  path?: string;
  url?: string;
  preview?: string;
  disk?: string;
  meta?: Record<string, unknown>;
  source?: AIFileSource;
};
