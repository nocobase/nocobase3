import spawn from "cross-spawn";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

// Only copy values that are needed to start the Hub runtime.  In particular,
// do not treat the build machine's complete environment as a deployment
// configuration: that would make a production artifact an accidental secret
// bundle.  Keep this list deliberately small and add a key only when the
// standalone/embedded server has a non-sensitive use for it.
const serverEnvKeys = [
  "APP_NAME",
  "APP_BASE_PATH",
  "APP_BROWSER_BASE_PATH",
  "APP_SERVER_HOST",
  "APP_SERVER_PORT",
  "APP_SERVER_START_LOG",
  "AUTH_BASE_URL",
  "HUB_ENABLED",
  "HUB_DATABASE_PATH",
  "HUB_RELEASE_ROOT",
  "API_CLIENT_STORAGE_PREFIX",
  "API_CLIENT_STORAGE_TYPE",
  "API_CLIENT_SHARE_TOKEN",
  "NOCOBASE_API_PROXY_TARGET",
  "NOCOBASE_API_PROXY_PATH",
];

const serverEnvKeySet = new Set(serverEnvKeys);

const parseEnv = (content) => {
  const parsed = {};
  const linePattern =
    /^\s*(?:export\s+)?([\w.-]+)\s*=\s*('(?:\\'|[^'])*'|"(?:\\"|[^"])*"|[^#\r\n]*)?\s*(?:#.*)?$/;

  for (const line of content.split(/\r?\n/)) {
    const match = line.match(linePattern);
    if (!match) {
      continue;
    }

    const [, key, rawValue = ""] = match;
    const quote = rawValue[0];
    let value = rawValue.trim();

    if (
      (quote === '"' || quote === "'") &&
      value.endsWith(quote) &&
      value.length >= 2
    ) {
      value = value.slice(1, -1);
    }

    parsed[key] = value.replace(/\\n/g, "\n").replace(/\\r/g, "\r");
  }

  return parsed;
};

const expandEnvValue = (value, env) =>
  value.replace(/\\?\${?([A-Za-z_][A-Za-z0-9_]*)}?/g, (match, key) => {
    if (match.startsWith("\\")) {
      return match.slice(1);
    }

    return env[key] ?? "";
  });

const readEnvFiles = (files, baseEnv = {}, allowedKeys) => {
  const env = {};

  for (const envFile of files) {
    if (!fs.existsSync(envFile)) {
      continue;
    }

    const parsed = parseEnv(fs.readFileSync(envFile, "utf8"));
    Object.assign(
      env,
      allowedKeys
        ? Object.fromEntries(
            Object.entries(parsed).filter(([key]) => allowedKeys.has(key)),
          )
        : parsed,
    );
  }

  const expansionEnv = { ...baseEnv, ...env };
  for (const [key, value] of Object.entries(env)) {
    env[key] = expandEnvValue(value, expansionEnv);
    expansionEnv[key] = env[key];
  }

  return env;
};

const formatEnvValue = (value) => {
  if (/^[A-Za-z0-9_./:@%+-]*$/.test(value)) {
    return value;
  }

  return JSON.stringify(value);
};

const isSafeUrlValue = (key, value) => {
  if (!["AUTH_BASE_URL", "NOCOBASE_API_PROXY_TARGET"].includes(key)) {
    return true;
  }

  // URL parsers normalize an empty `?` or `#` away, but those delimiters are
  // still part of the configured value and must not be copied into a deploy
  // artifact.
  if (/[?#]/.test(value)) {
    return false;
  }

  try {
    const url = new URL(value);
    return !url.username && !url.password && !url.search && !url.hash;
  } catch {
    // Keep invalid or relative values only when they cannot carry URL
    // credentials, query parameters, or fragments into the build artifact.
    return !value.includes("@");
  }
};

const isSafeEnvEntry = (key, value) => {
  if (!serverEnvKeySet.has(key) || !isSafeUrlValue(key, value)) {
    return false;
  }

  // This option is a boolean feature switch, not a token.  Refuse arbitrary
  // values so a misnamed secret cannot be copied under this key.
  if (key === "API_CLIENT_SHARE_TOKEN") {
    return /^(true|false|1|0|yes|no|on|off)$/i.test(value.trim());
  }

  return true;
};

const writeDistEnv = ({
  rootDir: envRootDir = rootDir,
  distDir: envDistDir = path.join(envRootDir, "dist"),
  baseEnv = process.env,
} = {}) => {
  const envFiles = [
    path.join(envRootDir, ".env"),
    path.join(envRootDir, ".env.local"),
  ];
  const processEntries = Object.fromEntries(
    serverEnvKeys
      .filter((key) => typeof baseEnv[key] === "string")
      .map((key) => [key, baseEnv[key]]),
  );

  // Expand only from the allowlisted values.  Passing process.env (or the
  // unfiltered parsed map) here could interpolate AUTH_SECRET into an
  // otherwise safe-looking value such as APP_BASE_PATH=${AUTH_SECRET}.
  const parsedEnv = readEnvFiles(envFiles, processEntries, serverEnvKeySet);
  // Match Vite and the standalone runtime: explicit process environment wins
  // over checked-in or local env files. This keeps the compiled client base
  // and the packaged server base on the same path in deployment builds.
  const effectiveEnv = { ...parsedEnv, ...processEntries };
  for (const [key, value] of Object.entries(effectiveEnv)) {
    effectiveEnv[key] = expandEnvValue(value, effectiveEnv);
  }
  const entries = serverEnvKeys
    .map((key) => [key, effectiveEnv[key]])
    .filter(
      (entry) =>
        typeof entry[1] === "string" &&
        entry[1].trim() !== "" &&
        isSafeEnvEntry(entry[0], entry[1]),
    );

  if (entries.length === 0) {
    fs.rmSync(path.join(envDistDir, ".env"), { force: true });
    console.log("\n> Extract environment");
    console.log(
      "No supported server environment entries found; skipped dist/.env",
    );
    return;
  }

  fs.mkdirSync(envDistDir, { recursive: true });
  const content = entries
    .map(([key, value]) => `${key}=${formatEnvValue(value)}`)
    .join("\n");

  const outputPath = path.join(envDistDir, ".env");
  fs.writeFileSync(outputPath, `${content}\n`, { mode: 0o600 });

  console.log("\n> Extract environment");
  console.log(
    `Generated ${path.relative(envRootDir, outputPath)} from ${envFiles
      .filter((envFile) => fs.existsSync(envFile))
      .map((envFile) => path.basename(envFile))
      .join(", ")}`,
  );
};

const run = (label, command, args) => {
  console.log(`\n> ${label}`);

  const result = spawn.sync(command, args, {
    cwd: rootDir,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

const buildServerWorkspaceFilters = [
  "@nocobase/app-host",
  "@nocobase/app-server",
  "@nocobase/app-sdk",
  "@nocobase/authentication",
  "@nocobase/authorization",
  "@nocobase/caching",
  "@nocobase/database",
];

const build = ({
  rootDir: buildRootDir = rootDir,
  distDir: buildDistDir = path.join(buildRootDir, "dist"),
} = {}) => {
  fs.rmSync(buildDistDir, { recursive: true, force: true });

  run("Typecheck client", "pnpm", ["exec", "tsc"]);
  run("Typecheck tooling", "pnpm", ["exec", "tsc", "-p", "tsconfig.node.json"]);
  run("Build client", "pnpm", ["exec", "refine", "build"]);
  run(
    "Build server workspace dependencies",
    "pnpm",
    buildServerWorkspaceFilters
      .flatMap((filter) => ["--filter", filter])
      .concat("build"),
  );
  run("Build server", "pnpm", ["exec", "tsc", "-p", "tsconfig.server.json"]);
  writeDistEnv({ rootDir: buildRootDir, distDir: buildDistDir });
  run("Generate server package", "node", [
    "./scripts/build-server-dist-package.mjs",
  ]);
  run("Install server production dependencies", "npm", [
    "install",
    "--omit=dev",
    "--package-lock=false",
    "--prefix",
    "./dist",
  ]);
  run("Clean server dependency bins", "node", ["./scripts/clean-dist-bin.mjs"]);

  console.log(
    "\nBuild complete: dist/client, dist/server, dist/.env, and dist/package.json",
  );
};

build();
