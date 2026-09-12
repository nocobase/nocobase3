const MINIMUM_NODE_MAJOR = 24;

export function isSupportedNodeVersion(version = process.versions.node) {
  return Number.parseInt(version.split('.')[0] ?? '', 10) >= MINIMUM_NODE_MAJOR;
}

export function formatUnsupportedNodeVersionMessage(version) {
  return `create-plugin requires Node.js ${MINIMUM_NODE_MAJOR} or newer. Current version: ${version}`;
}
