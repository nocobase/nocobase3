import { getPortalBase } from '@nocobase/app-portal-sdk/runtime';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function assetUrl(path: string): string {
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(path)) return path;

  const base = getPortalBase().replace(/\/+$/, '');
  if (base && (path === base || path.startsWith(`${base}/`))) return path;

  const normalizedPath = path.replace(/^\/+/, '');
  const assetPath =
    normalizedPath === 'assets' || normalizedPath.startsWith('assets/')
      ? `/${normalizedPath}`
      : `/assets/${normalizedPath}`;

  if (base && (assetPath === base || assetPath.startsWith(`${base}/`))) {
    return assetPath;
  }

  return `${base}${assetPath}`;
}
