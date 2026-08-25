// 提醒「改了可发布代码但没写 changeset」。
//
// 刻意始终以 0 退出。CI 能看出哪些包被改了，但看不出这次重构值不值得发版，
// 更看不出该 patch 还是 minor。把判断权留给开发者和 reviewer，
// 否则大家会为了过检查而随手补一个 patch，反而让版本号失去意义。
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const { BASE_SHA, HEAD_SHA, SKIP_LABEL } = process.env;

if (!BASE_SHA || !HEAD_SHA) {
  console.log('缺少 BASE_SHA / HEAD_SHA，跳过 advisory。');
  process.exit(0);
}

function git(...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' });
}

// 明确不影响发布产物的路径。判断不准时按「影响产物」处理，宁可多提醒。
const IGNORED = [
  /^packages\/[^/]+\/test\//,
  /^packages\/[^/]+\/.*\.test\.[jt]sx?$/,
  /^packages\/[^/]+\/README\.md$/,
];

function loadPackages() {
  const dir = path.join(root, 'packages');
  const map = new Map();
  if (!fs.existsSync(dir)) return map;
  for (const d of fs.readdirSync(dir)) {
    const manifest = path.join(dir, d, 'package.json');
    if (!fs.existsSync(manifest)) continue;
    const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    map.set(d, pkg);
  }
  return map;
}

const packages = loadPackages();
const changed = git(
  'diff',
  '--name-only',
  '--diff-filter=ACMR',
  BASE_SHA,
  HEAD_SHA,
)
  .split('\n')
  .filter(Boolean);

const touched = new Set();
for (const file of changed) {
  const m = file.match(/^packages\/([^/]+)\//);
  if (!m) continue;
  if (IGNORED.some((re) => re.test(file))) continue;
  const pkg = packages.get(m[1]);
  if (!pkg || pkg.private) continue;
  touched.add(pkg.name);
}

// 收集本 PR 新增的 changeset 覆盖了哪些包
const declared = new Set();
const changesetFiles = changed.filter(
  (f) => f.startsWith('.changeset/') && f.endsWith('.md'),
);
for (const file of changesetFiles) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) continue;
  const match = fs
    .readFileSync(full, 'utf8')
    .match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) continue;
  for (const line of match[1].split(/\r?\n/)) {
    const entry = line.match(/^\s*(?:"([^"]+)"|'([^']+)'|([^:]+?))\s*:/);
    if (entry) declared.add((entry[1] ?? entry[2] ?? entry[3]).trim());
  }
}

const uncovered = [...touched].filter((name) => !declared.has(name)).sort();

const summaryPath = process.env.GITHUB_STEP_SUMMARY;
const write = (text) => {
  console.log(text);
  if (summaryPath) fs.appendFileSync(summaryPath, `${text}\n`);
};

if (SKIP_LABEL === 'true') {
  write('### Changeset advisory');
  write('');
  write('PR 带有 `release:skip` label，已记录「本次不发版」的决定。');
  if (uncovered.length) {
    write('');
    write(`被跳过的包：${uncovered.map((n) => `\`${n}\``).join('、')}`);
  }
  process.exit(0);
}

write('### Changeset advisory');
write('');

if (!touched.size) {
  write('本次没有改动可发布 package 的产物代码。');
  process.exit(0);
}

if (!uncovered.length) {
  write(
    `改动的可发布 package 都已声明 changeset：${[...touched].map((n) => `\`${n}\``).join('、')}`,
  );
  process.exit(0);
}

write('以下 package 有产物改动但没有对应 changeset：');
write('');
for (const name of uncovered) write(`- \`${name}\``);
write('');
write(
  '如果需要发版，运行 `pnpm changeset` 补一份；如果确实不需要，加 `release:skip` label 说明原因。',
);
write('');
write('_这是提醒，不会阻止合并。_');

for (const name of uncovered) {
  console.log(`::warning::${name} 有产物改动但缺少 changeset`);
}
