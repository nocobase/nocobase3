/**
 * Point the CDN at a freshly uploaded docs version, then delete the versions it replaced.
 *
 * A release is not an overwrite. Every build is uploaded to its own timestamp directory in the bucket, and publishing
 * is the single act of rewriting the CDN's back-to-origin rules to prefix that directory. Readers see the old site or
 * the new one, never a half-replaced mixture, and a bad release is rolled back by pointing the rules at the previous
 * directory rather than by re-uploading anything.
 *
 * This script does not upload. The workflow has already put the files in place by the time it runs; its argument is
 * the directory to switch to.
 *
 * Ported from the v2 `nocobase docs:update` command. The rewrite rules are the load-bearing part and are reproduced
 * with their original semantics — read the comment above REWRITE_RULES before changing any of them.
 */
import openapi from '@alicloud/openapi-client';
import cdn20180510 from '@alicloud/cdn20180510';
import OSS from 'ali-oss';

// Both SDKs are CommonJS. Their client classes sit on a nested `default`, and destructuring the request classes from
// the namespace object is what works under Node's interop — named imports resolve to `undefined` here.
const { Config } = openapi;
const Cdn = cdn20180510.default;
const {
  BatchSetCdnDomainConfigRequest,
  DescribeCdnDomainConfigsRequest,
  RefreshObjectCachesRequest,
} = cdn20180510;

const REQUIRED_ENV_VARS = [
  'DOCS_ALI_OSS_ACCESS_KEY_ID',
  'DOCS_ALI_OSS_ACCESS_KEY_SECRET',
  'DOCS_ALI_OSS_BUCKET',
  'DOCS_ALI_OSS_REGION',
  'DOCS_ALI_CDN_DOMAIN',
];

/** A published version directory: `20260904150000/`. Anything else in the bucket root is left alone. */
const TIMESTAMP_DIR_PATTERN = /^\d{14}\/$/u;

/**
 * Versions to keep besides the one being published. One is enough to roll back to, and each version is a full copy of
 * the site, so keeping more is storage spent on directories nothing will ever point at again.
 */
const KEEP_VERSIONS = 1;

const OSS_LIST_MAX_KEYS = 1000;
const OSS_DELETE_BATCH_SIZE = 1000;

const POLL_INTERVAL_MS = 10_000;
const POLL_MAX_ATTEMPTS = 180; // 30 minutes.

/**
 * The rules that turn a public URL into a path inside the current version directory. Order matters: every rule sets
 * `flag: break`, so the first match wins and later rules never see the request.
 *
 * Two of these exist for reasons that are not obvious from reading them:
 *
 * - The `/api/ai/` rule comes first so the assistant's API calls pass through untouched. Without it the catch-all
 *   below would prefix them with a version directory and the assistant would call a path that does not exist.
 * - The two `[^.]*[^/.]` rules map extensionless URLs onto `index.html`. This is what makes Rspress's `cleanUrls`
 *   work on OSS, and it only works in combination with `scripts/normalize-html-output.mjs`, which rewrites `foo.html`
 *   to `foo/index.html` before upload. Change one and the other has to change with it, or every page 404s.
 *
 * English is served from the bucket root because it builds to `dist/`, so its `/en/` prefix is stripped here; every
 * other language builds to `dist/<lang>/` and needs no special handling.
 */
const REWRITE_RULES = [
  { sourceUrl: '^/api/ai/(.*)$', target: () => '/api/ai/$1' },
  {
    sourceUrl: '^/en/([^.]*[^/.])$',
    target: (ts) => `/${ts}/$1/index.html`,
  },
  { sourceUrl: '^/([^.]*[^/.])$', target: (ts) => `/${ts}/$1/index.html` },
  { sourceUrl: '^/en/(.*)', target: (ts) => `/${ts}/$1` },
  { sourceUrl: '^/(.*)', target: (ts) => `/${ts}/$1` },
];

const FUNCTION_NAME = 'back_to_origin_url_rewrite';

function normalizeDomain(domain) {
  return domain.replace(/^https?:\/\//u, '').replace(/\/+$/u, '');
}

function createCdnClient() {
  const config = new Config({
    accessKeyId: process.env.DOCS_ALI_OSS_ACCESS_KEY_ID,
    accessKeySecret: process.env.DOCS_ALI_OSS_ACCESS_KEY_SECRET,
  });
  // CDN is a global service in Aliyun's API surface — there is no region to pass.
  config.endpoint = 'cdn.aliyuncs.com';
  return new Cdn(config);
}

function createOssClient() {
  return new OSS({
    accessKeyId: process.env.DOCS_ALI_OSS_ACCESS_KEY_ID,
    accessKeySecret: process.env.DOCS_ALI_OSS_ACCESS_KEY_SECRET,
    bucket: process.env.DOCS_ALI_OSS_BUCKET,
    region: process.env.DOCS_ALI_OSS_REGION,
  });
}

async function describeRewriteConfigs(cdnClient, domain) {
  const response = await cdnClient.describeCdnDomainConfigs(
    new DescribeCdnDomainConfigsRequest({
      domainName: domain,
      functionNames: FUNCTION_NAME,
    }),
  );
  return response.body?.domainConfigs?.domainConfig ?? [];
}

function readArg(config, argName) {
  const args = config.functionArgs?.functionArg ?? [];
  return args.find((arg) => arg.argName === argName)?.argValue;
}

/**
 * Write the rules, reusing the `configId` of any rule already on the domain so that this updates it rather than
 * adding a duplicate. A first deployment has nothing to read, which is why a failure here is a warning: the rules are
 * still written, just as new ones.
 */
async function updateRewriteRules(cdnClient, domain, timestamp) {
  const existingIdBySource = new Map();

  try {
    for (const config of await describeRewriteConfigs(cdnClient, domain)) {
      const source = readArg(config, 'source_url');
      if (source) existingIdBySource.set(source, config.configId);
    }
  } catch (error) {
    console.warn(
      `Could not read existing CDN configuration, treating this as a first deployment: ${error.message}`,
    );
  }

  const functions = REWRITE_RULES.map((rule) => {
    const config = {
      functionName: FUNCTION_NAME,
      functionArgs: [
        { argName: 'source_url', argValue: rule.sourceUrl },
        { argName: 'target_url', argValue: rule.target(timestamp) },
        { argName: 'flag', argValue: 'break' },
      ],
    };

    const configId = existingIdBySource.get(rule.sourceUrl);
    if (configId) config.configId = configId;

    return config;
  });

  await cdnClient.batchSetCdnDomainConfig(
    new BatchSetCdnDomainConfigRequest({
      domainNames: domain,
      functions: JSON.stringify(functions),
    }),
  );
}

/**
 * A rule is live once the API reports it `success` with the target we just wrote. Refreshing the cache before that
 * point would repopulate the edge from the previous version, so this waits first.
 */
function rulesAreLive(configs, timestamp) {
  return REWRITE_RULES.every((rule) => {
    const config = configs.find(
      (candidate) => readArg(candidate, 'source_url') === rule.sourceUrl,
    );
    if (!config || config.status !== 'success') return false;
    return readArg(config, 'target_url') === rule.target(timestamp);
  });
}

async function waitForRewriteRules(cdnClient, domain, timestamp) {
  for (let attempt = 1; attempt <= POLL_MAX_ATTEMPTS; attempt += 1) {
    try {
      const configs = await describeRewriteConfigs(cdnClient, domain);
      if (rulesAreLive(configs, timestamp)) {
        console.log(`Rewrite rules are live (attempt ${attempt}).`);
        return true;
      }
    } catch (error) {
      console.log(`Could not read rule status, retrying: ${error.message}`);
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  return false;
}

async function refreshCache(cdnClient, domain) {
  await cdnClient.refreshObjectCaches(
    new RefreshObjectCachesRequest({
      objectPath: `https://${domain}/`,
      objectType: 'Directory',
    }),
  );
}

async function listObjectsUnder(ossClient, prefix) {
  const names = [];
  let marker;

  for (;;) {
    const params = { prefix, 'max-keys': OSS_LIST_MAX_KEYS };
    if (marker) params.marker = marker;

    const result = await ossClient.list(params);
    for (const object of result.objects ?? []) names.push(object.name);

    if (!result.isTruncated) return names;
    marker = result.nextMarker;
  }
}

/**
 * Delete the version directories that are neither current nor the one kept for rollback.
 *
 * Timestamp names sort chronologically as strings, so the newest are the tail of the sorted list. Only names matching
 * the timestamp pattern are considered — `404.html` and anything else at the bucket root is never touched.
 */
async function cleanUpOldVersions(ossClient) {
  const result = await ossClient.list({
    prefix: '',
    delimiter: '/',
    'max-keys': OSS_LIST_MAX_KEYS,
  });

  const versions = (result.prefixes ?? [])
    .filter((prefix) => TIMESTAMP_DIR_PATTERN.test(prefix))
    .sort();

  // The version just published is in this list, so it is kept alongside KEEP_VERSIONS older ones.
  const keep = KEEP_VERSIONS + 1;
  if (versions.length <= keep) {
    console.log(
      `${versions.length} version(s) in the bucket; nothing to remove.`,
    );
    return;
  }

  const stale = versions.slice(0, versions.length - keep);
  console.log(
    `${versions.length} version(s) in the bucket; removing ${stale.length} of them.`,
  );

  for (const prefix of stale) {
    const names = await listObjectsUnder(ossClient, prefix);

    for (let index = 0; index < names.length; index += OSS_DELETE_BATCH_SIZE) {
      await ossClient.deleteMulti(
        names.slice(index, index + OSS_DELETE_BATCH_SIZE),
        { quiet: true },
      );
    }

    console.log(`  removed ${prefix} (${names.length} objects)`);
  }
}

function readTimestamp(argv) {
  const index = argv.indexOf('--timestamp');
  if (index !== -1) return argv[index + 1];

  const inline = argv.find((arg) => arg.startsWith('--timestamp='));
  return inline?.slice('--timestamp='.length);
}

async function main() {
  const missing = REQUIRED_ENV_VARS.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    console.error(
      `Missing required environment variables: ${missing.join(', ')}`,
    );
    process.exit(1);
  }

  const timestamp = readTimestamp(process.argv.slice(2));
  if (!timestamp || !/^\d{14}$/u.test(timestamp)) {
    console.error(
      'Pass the uploaded version directory as --timestamp <YYYYMMDDHHMMSS>.',
    );
    process.exit(1);
  }

  const domain = normalizeDomain(process.env.DOCS_ALI_CDN_DOMAIN);
  const cdnClient = createCdnClient();
  const ossClient = createOssClient();

  // Publishing and cleanup fail independently. A failed switch must fail the job — readers would still be on the old
  // version with nobody told. A failed cleanup must not: the new version is already live, and stale directories cost
  // storage rather than correctness. The next run will collect them.
  console.log(`Pointing ${domain} at /${timestamp}/ ...`);
  await updateRewriteRules(cdnClient, domain, timestamp);

  const live = await waitForRewriteRules(cdnClient, domain, timestamp);
  if (!live) {
    console.error(
      `Rewrite rules did not report success within ${(POLL_INTERVAL_MS * POLL_MAX_ATTEMPTS) / 60_000} minutes. ` +
        'The cache has not been refreshed, so readers stay on the previous version. Check the CDN console.',
    );
    process.exit(1);
  }

  await refreshCache(cdnClient, domain);
  console.log(`Published. https://${domain}/ now serves /${timestamp}/.`);

  try {
    await cleanUpOldVersions(ossClient);
  } catch (error) {
    console.warn(
      `Cleanup failed, leaving old versions in place: ${error.message}`,
    );
  }
}

await main();
