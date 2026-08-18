export interface S3CredentialIdentity { accessKeyId: string; secretAccessKey: string; sessionToken?: string; expiration?: Date }
export type S3CredentialProvider = () => Promise<S3CredentialIdentity>;
export interface S3BackendConfig { driver: "s3"; endpoint?: string; region: string; container: string; rootPrefix?: string; forcePathStyle?: boolean; credentials?: S3CredentialIdentity | S3CredentialProvider }
