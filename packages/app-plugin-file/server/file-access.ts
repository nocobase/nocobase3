import { FileUnavailableError, InvalidFileInputError } from './errors.js';
import { issueFileToken, verifyFileToken } from './token.js';

export interface FileAccessUrl {
  readonly url: string;
  readonly expiresAt: string | null;
}

export interface IssueFileAccessOptions {
  readonly tokenSecret?: string;
  readonly publicBasePath: string;
  readonly audience: string;
  readonly fileId: string;
  readonly contentPath: string;
  readonly expiresIn?: number;
}

export function issueFileAccessUrl(
  options: IssueFileAccessOptions,
): FileAccessUrl {
  const issued = issueFileToken({
    secret: resolveTokenSecret(options.tokenSecret),
    audience: options.audience,
    fileId: options.fileId,
    expiresIn: options.expiresIn,
  });
  const pathname = resolvePublicPath(
    options.contentPath,
    options.publicBasePath,
  );
  const url = new URL(pathname, 'http://files.local');
  url.searchParams.set('token', issued.token);
  return {
    url: `${url.pathname}${url.search}`,
    expiresAt: new Date(issued.expiresAt * 1000).toISOString(),
  };
}

export function verifyFileAccessToken(options: {
  readonly tokenSecret?: string;
  readonly audience: string;
  readonly fileId: string;
  readonly token: string;
  readonly now?: number;
}): void {
  verifyFileToken({
    secret: resolveTokenSecret(options.tokenSecret),
    audience: options.audience,
    fileId: options.fileId,
    token: options.token,
    now: options.now,
  });
}

function resolveTokenSecret(secret: string | undefined): string {
  if (!secret) {
    throw new FileUnavailableError(
      'File access token signing is not configured.',
    );
  }
  return secret;
}

function resolvePublicPath(
  contentPath: string,
  publicBasePath: string,
): string {
  if (!contentPath.trim().startsWith('/')) {
    throw new InvalidFileInputError('File content path must be root-relative.');
  }

  let url: URL;
  try {
    url = new URL(contentPath, 'http://files.local');
  } catch {
    throw new InvalidFileInputError('File content path is invalid.');
  }
  if (
    url.origin !== 'http://files.local' ||
    url.search.length > 0 ||
    url.hash.length > 0
  ) {
    throw new InvalidFileInputError(
      'File content path must be a root-relative path without a query or fragment.',
    );
  }

  const basePath = normalizePath(publicBasePath);
  const pathname = normalizePath(url.pathname);
  if (!basePath) return pathname || '/';
  if (pathname === basePath || pathname.startsWith(`${basePath}/`)) {
    return pathname;
  }
  return pathname ? `${basePath}${pathname}` : `${basePath}/`;
}

function normalizePath(value: string): string {
  const normalized = value.trim().replace(/^\/+|\/+$/g, '');
  return normalized ? `/${normalized}` : '';
}
