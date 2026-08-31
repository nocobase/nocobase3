const MINIMUM_NODE_MAJOR_VERSION = 24;

export function getNodeMajorVersion(version = process.versions.node) {
  const match = String(version ?? '')
    .trim()
    .match(/^v?(\d+)/);

  return match ? Number.parseInt(match[1], 10) : Number.NaN;
}

export function isSupportedNodeVersion(
  version = process.versions.node,
  minimum = MINIMUM_NODE_MAJOR_VERSION,
) {
  const major = getNodeMajorVersion(version);
  return Number.isInteger(major) && major >= minimum;
}

export function formatUnsupportedNodeVersionMessage(
  version = process.version,
  minimum = MINIMUM_NODE_MAJOR_VERSION,
) {
  const current = String(version ?? '').trim() || 'unknown';

  return [
    `[create-app]: Node.js ${minimum} or later is required.`,
    `[create-app]: Current version is ${current}. Install Node.js ${minimum}+ and try again.`,
  ].join('\n');
}

export { MINIMUM_NODE_MAJOR_VERSION };
