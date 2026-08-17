import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { getPortalBase } from "@nocobase/portal-sdk/runtime"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function assetUrl(path: string) {
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(path)) return path

  const base = getPortalBase().replace(/\/+$/, "")
  const assetPath = `/${path.replace(/^\/+/, "")}`

  if (base && (assetPath === base || assetPath.startsWith(`${base}/`))) {
    return assetPath
  }

  return `${base}${assetPath}`
}
