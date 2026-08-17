import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const action = process.argv[2];

if (!new Set(["build", "materialize"]).has(action)) {
  throw new Error("Usage: node scripts/registry.mjs <build|materialize>");
}

const toPosix = (value) => value.split(path.sep).join("/");

function walkFiles(directory, root = directory) {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const entryPath = path.join(directory, entry.name);
      return entry.isDirectory()
        ? walkFiles(entryPath, root)
        : [toPosix(path.relative(root, entryPath))];
    })
    .sort((left, right) => left.localeCompare(right));
}

function isIncluded(file, include) {
  return include.some((entry) => {
    const normalized = entry.replace(/^\.\//, "").replace(/\/$/, "");
    return (
      normalized === "." ||
      file === normalized ||
      file.startsWith(`${normalized}/`)
    );
  });
}

function assertSafePath(value, prefix, label) {
  if (
    !value.startsWith(prefix) ||
    path.isAbsolute(value) ||
    value.split("/").includes("..")
  ) {
    throw new Error(`Unsafe ${label} path: ${value}`);
  }
}

const config = JSON.parse(
  fs.readFileSync(path.join(projectRoot, "registry.config.json"), "utf8")
);
const itemNames = new Set();
const filesByRoot = new Map();
const portalSdkImport = "@nocobase/portal-sdk";
const sourceItems = config.items.map((item) => {
  if (!item.name || itemNames.has(item.name)) {
    throw new Error(`Registry item name must be unique: ${item.name}`);
  }
  itemNames.add(item.name);

  const source = item.source;
  if (!source) {
    throw new Error(`Registry item ${item.name} is missing its source mapping`);
  }
  assertSafePath(source.root, "registry/", "source");
  assertSafePath(source.target, "client/extensions/", "target");

  const sourceRoot = path.join(projectRoot, source.root);
  if (!fs.existsSync(sourceRoot)) {
    throw new Error(`Registry source does not exist: ${source.root}`);
  }
  if (!Array.isArray(source.include) || !source.include.length) {
    throw new Error(`Registry item ${item.name} must include at least one path`);
  }

  const allFiles = filesByRoot.get(source.root) ?? walkFiles(sourceRoot);
  filesByRoot.set(source.root, allFiles);
  const includedFiles = allFiles.filter((file) =>
    isIncluded(file, source.include)
  );
  if (!includedFiles.length) {
    throw new Error(
      `Registry item ${item.name} include paths did not match any files`
    );
  }

  const includedSource = includedFiles
    .filter((file) => /\.[cm]?[jt]sx?$/.test(file))
    .map((file) => ({
      file,
      content: fs.readFileSync(path.join(sourceRoot, file), "utf8"),
    }));
  const usesPortalSdk = includedSource.some(({ content }) =>
    content.includes(portalSdkImport)
  );
  const portalSdkDependency = item.dependencies?.find((dependency) =>
    dependency.startsWith(`${portalSdkImport}@`)
  );

  if (usesPortalSdk && !portalSdkDependency) {
    throw new Error(
      `Registry item ${item.name} imports ${portalSdkImport} without declaring a versioned dependency`
    );
  }

  return { item, includedFiles };
});

if (action === "build") {
  const items = sourceItems.map(({ item, includedFiles }) => {
    const { source, ...registryItem } = item;
    return {
      ...registryItem,
      files: includedFiles.map((file) => ({
        path: path.posix.join(source.root, file),
        type: "registry:file",
        target: path.posix.join(source.target, file),
      })),
    };
  });

  fs.writeFileSync(
    path.join(projectRoot, "registry.json"),
    `${JSON.stringify(
      {
        $schema: "https://ui.shadcn.com/schema/registry.json",
        ...config,
        items,
      },
      null,
      2
    )}\n`
  );

  for (const item of items) {
    console.log(`${item.name}: ${item.files.length} files`);
  }
} else {
  const outputRootIndex = process.argv.indexOf("--output-root");
  if (outputRootIndex !== -1 && !process.argv[outputRootIndex + 1]) {
    throw new Error("--output-root requires a directory");
  }
  const outputRoot =
    outputRootIndex === -1
      ? projectRoot
      : path.resolve(process.argv[outputRootIndex + 1]);
  const mappings = new Map();

  for (const { item } of sourceItems) {
    const source = item.source;

    const key = `${source.root}\0${source.target}`;
    const mapping = mappings.get(key) ?? {
      root: source.root,
      target: source.target,
      include: new Set(),
    };
    source.include.forEach((entry) => mapping.include.add(entry));
    mappings.set(key, mapping);
  }

  for (const mapping of mappings.values()) {
    if (fs.existsSync(path.join(outputRoot, mapping.target))) {
      throw new Error(
        `Default extension target already exists: ${mapping.target}`
      );
    }
  }

  for (const mapping of mappings.values()) {
    const sourceRoot = path.join(projectRoot, mapping.root);
    const files = walkFiles(sourceRoot).filter((file) =>
      isIncluded(file, [...mapping.include])
    );

    for (const file of files) {
      const targetFile = path.join(outputRoot, mapping.target, file);
      fs.mkdirSync(path.dirname(targetFile), { recursive: true });
      fs.copyFileSync(path.join(sourceRoot, file), targetFile);
    }

    console.log(`${mapping.target}: ${files.length} files`);
  }
}
