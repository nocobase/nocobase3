import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import semver from 'semver';
import type { Plugin, RenderBuiltAssetUrl, ResolvedConfig } from 'vite';

import { formatPortalTemplateCompatibilityError } from '../compat/index.ts';

type PortalPackage = {
  name?: string;
  version?: string;
  nocobase?: {
    defaultTemplateVersion?: string;
    supportedDefaultTemplateRange?: string;
  };
};

const readPackage = (packagePath: string): PortalPackage =>
  JSON.parse(fs.readFileSync(packagePath, 'utf8')) as PortalPackage;

const sdkPackagePath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../package.json',
);

const COMPATIBILITY_CHECK_DISABLED = true;

export const portalSdkCompatibilityPlugin = ({
  root = process.cwd(),
}: {
  root?: string;
} = {}): Plugin => ({
  name: 'nocobase-portal-sdk-compatibility',
  configResolved() {
    // Disabled while v3 is unreleased. The gate compares the project's template version against the range this SDK
    // supports, which only means something once templates are published and their versions carry release history.
    // Every v3 package currently sits at 0.0.1, so the gate would reject every project it exists to protect.
    // Re-enable together with the same check in scripts/check-template-compatibility.mjs once templates ship.
    if (COMPATIBILITY_CHECK_DISABLED) {
      return;
    }

    const projectPackage = readPackage(path.resolve(root, 'package.json'));
    const sdkPackage = readPackage(sdkPackagePath);
    const defaultTemplateVersion =
      projectPackage.nocobase?.defaultTemplateVersion ??
      (projectPackage.name === '@nocobase/portal-template-default'
        ? projectPackage.version
        : undefined);
    const supportedDefaultTemplateRange =
      sdkPackage.nocobase?.supportedDefaultTemplateRange;

    if (!defaultTemplateVersion) {
      throw new Error(
        'Missing nocobase.defaultTemplateVersion in the project package.json.',
      );
    }
    if (!supportedDefaultTemplateRange || !sdkPackage.version) {
      throw new Error(
        'The installed @nocobase/app-portal-sdk has incomplete compatibility metadata.',
      );
    }
    if (!semver.valid(defaultTemplateVersion)) {
      throw new Error(
        `Invalid nocobase.defaultTemplateVersion: ${defaultTemplateVersion}`,
      );
    }
    if (!semver.valid(sdkPackage.version)) {
      throw new Error(
        `Invalid @nocobase/app-portal-sdk version: ${sdkPackage.version}`,
      );
    }
    if (!semver.validRange(supportedDefaultTemplateRange)) {
      throw new Error(
        `Invalid SDK supportedDefaultTemplateRange: ${supportedDefaultTemplateRange}`,
      );
    }
    if (
      !semver.satisfies(defaultTemplateVersion, supportedDefaultTemplateRange)
    ) {
      throw new Error(
        formatPortalTemplateCompatibilityError({
          defaultTemplateVersion,
          sdkVersion: sdkPackage.version,
          supportedDefaultTemplateRange,
        }),
      );
    }
  },
});

const defaultRuntimeConfig = `<!-- nocobase-runtime-config:start -->
<script>
  window.NOCOBASE_PORTAL_BASE = "/";
  window.NOCOBASE_API_URL = "/api";
  window.__nocobase_api_client_storage_prefix__ = window.__nocobase_api_client_storage_prefix__ ?? "NOCOBASE_";
  window.__nocobase_api_client_storage_type__ = window.__nocobase_api_client_storage_type__ ?? "localStorage";
  window.__nocobase_api_client_share_token__ = window.__nocobase_api_client_share_token__ ?? false;
</script>
<!-- nocobase-runtime-config:end -->
`;

const getBasePrefix = (base: string) => base.replace(/\/$/, '');

const renderPortalBuiltUrl: RenderBuiltAssetUrl = (
  filename,
  { hostType, ssr },
) => {
  if (ssr) return undefined;

  if (hostType === 'js') {
    return {
      runtime: `new URL(${JSON.stringify(filename)}, new URL(window.NOCOBASE_PORTAL_BASE || "/", window.location.origin)).href`,
    };
  }

  if (hostType === 'css') {
    return { relative: true };
  }

  return undefined;
};

const stripBaseFromIndexHtml = (html: string, base: string) => {
  const basePrefix = getBasePrefix(base);
  if (!basePrefix) return html;

  const attributePattern = /\b(src|href|content)=(["'])\/(?!\/)([^"']*)\2/g;

  return html.replace(
    attributePattern,
    (match, attribute, quote, assetPath) => {
      const value = `/${assetPath}`;
      if (!value.startsWith(`${basePrefix}/`)) return match;
      return `${attribute}=${quote}${value.slice(basePrefix.length) || '/'}${quote}`;
    },
  );
};

export const portalRawIndexHtmlPlugin = ({
  root = process.cwd(),
  base,
}: {
  root?: string;
  base: string;
}): Plugin => {
  let config: ResolvedConfig | undefined;

  return {
    name: 'nocobase-copy-raw-index-html',
    config() {
      return {
        experimental: {
          renderBuiltUrl: renderPortalBuiltUrl,
        },
      };
    },
    configResolved(resolvedConfig) {
      config = resolvedConfig;
    },
    closeBundle() {
      const distDir = path.resolve(root, config?.build.outDir ?? 'dist');
      const indexHtml = path.join(distDir, 'index.html');
      const rawIndexHtml = path.join(distDir, 'index.raw.html');

      if (!fs.existsSync(indexHtml)) return;

      const html = fs.readFileSync(indexHtml, 'utf8');
      const rawHtml = stripBaseFromIndexHtml(html, base);
      const moduleScriptPattern = /<script\s+[^>]*type=["']module["'][^>]*>/i;
      const moduleScriptMatch = rawHtml.match(moduleScriptPattern);

      if (moduleScriptMatch?.index === undefined) {
        fs.writeFileSync(rawIndexHtml, rawHtml);
        return;
      }

      fs.writeFileSync(
        rawIndexHtml,
        `${rawHtml.slice(0, moduleScriptMatch.index)}${defaultRuntimeConfig}${rawHtml.slice(moduleScriptMatch.index)}`,
      );
    },
  };
};
