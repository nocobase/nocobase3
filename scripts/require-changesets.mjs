// 检查「改了可发布代码但没写 changeset」，缺失时以非零码退出，阻止合并。
//
// 这里判断的是「改动会不会进入发布产物」，不是「值不值得发版」。前者机器能看准：
// 一个文件要么随包发出去，要么不会。后者仍然留给人——patch 还是 minor 由写
// changeset 的人决定，而确实不需要发版的改动加 `release:skip` label 放行。
//
// 曾经这里只提醒不阻塞，理由是怕大家为了过检查随手补 patch。现实是漏发比误发
// 更贵：包发不出去，用户装到的还是旧的，而 CI 全绿，没有任何人会发现。
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const { BASE_SHA, HEAD_SHA, SKIP_LABEL } = process.env;

if (!BASE_SHA || !HEAD_SHA) {
  console.log('缺少 BASE_SHA / HEAD_SHA，跳过检查。');
  process.exit(0);
}

function git(...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' });
}

// 从分叉点开始比，而不是直接 diff base..head。
//
// `pull_request.base.sha` 是目标分支当下的 HEAD，不是这个 PR 的分叉点。目标分支
// 在 PR 开着的期间前进过，两点 diff 就会把「目标分支有、这个分支没有」的提交也
// 算成本次改动——方向还是反的，别人新增的文件在这里表现为被删除。于是一个只改了
// CI 脚本的 PR，被要求为三个它从未碰过的模板包写 changeset。
//
// merge-base 之后 diff 只包含这个分支自己的提交。git 的 `A...B` 三点写法就是
// 这个语义，但 GitHub 给的是两个裸 SHA，所以显式求一次分叉点：真实场景下这两个
// 提交总是同一棵树里的，求不出来的话（浅克隆、force-push 之后的竞态）退回 base，
// 宁可多报也不要漏报。
function diffBase(base, head) {
  try {
    return git('merge-base', base, head).trim() || base;
  } catch {
    return base;
  }
}

// 不进入发布产物的路径，相对包根目录。判断不准时按「影响产物」处理——漏掉一个
// changeset 的代价，比多要求一次大。
//
// 注意这里不含 AGENTS.md、CLAUDE.md 和 skills/。它们随包发布，注册插件时会同步
// 到用户应用的 `.agents/skills/`，AI 照着它们写代码——改了却发不出去，用户那边
// 的 AI 就一直按旧规则工作。它们是产物，不是文档。
const DOCS_AND_TESTS = [
  // 阅读用文档。README.md 与 README.zh-CN.md、README.MD 等变体一起匹配。
  /^README(\.[\w-]+)?\.mdx?$/i,
  /^CHANGELOG\.md$/i,
  /^docs\//,

  // 测试。仓库约定测试放在包根的 tests/，但嵌套源码根下也有自己的 tests/
  // （如 plugins/app-plugin-authentication/server/tests），所以两种都要匹配。
  /^tests?\//,
  /(^|\/)tests?\//,
  /^e2e\//,
  /^skill-evals\//,
  /\.(test|spec)\.[jt]sx?$/,
];

// 只在本仓库开发时使用、不随包发布的配置。
const DEV_CONFIG = [
  /^eslint\.config\.[jt]s$/,
  /^\.prettierrc/,
  /^\.prettierignore$/,
  /^vitest\.config\.[jt]s$/,
  /^vite\.config\.[jt]s$/,
  /^playwright\.config\.[jt]s$/,
  // tsconfig 只忽略确实不参与构建的那几个。根 tsconfig.json 决定 .d.ts
  // 怎么生成，改了会直接改变发布出去的类型声明，所以它算产物。
  /^tsconfig\.(node|test|vitest|eslint)\.json$/,
];

function isIgnoredInPackage(relative, pkg) {
  if (DOCS_AND_TESTS.some((re) => re.test(relative))) return true;

  // 模板包把源码本身作为产物发布，files 里列着 eslint.config.js、vitest.config.ts
  // 这些在库包里属于开发配置的文件。对它们只忽略上面的文档和测试。
  const filesField = Array.isArray(pkg.files) ? pkg.files : [];
  const shipsConfig = filesField.some((entry) =>
    /^(eslint\.config|vitest\.config|vite\.config|tsconfig)/.test(entry),
  );
  if (shipsConfig) return false;

  return DEV_CONFIG.some((re) => re.test(relative));
}

// key 是相对 packages/ 的两段路径（如 libs/db），和下面从改动文件里截出来的前缀对齐。
function loadPackages() {
  const dir = path.join(root, 'packages');
  const map = new Map();
  if (!fs.existsSync(dir)) return map;
  for (const category of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!category.isDirectory()) continue;
    const categoryDir = path.join(dir, category.name);
    for (const entry of fs.readdirSync(categoryDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const manifest = path.join(categoryDir, entry.name, 'package.json');
      if (!fs.existsSync(manifest)) continue;
      const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'));
      map.set(`${category.name}/${entry.name}`, pkg);
    }
  }
  return map;
}

const packages = loadPackages();
const changed = git(
  'diff',
  '--name-only',
  '--diff-filter=ACMR',
  diffBase(BASE_SHA, HEAD_SHA),
  HEAD_SHA,
)
  .split('\n')
  .filter(Boolean);

// 每个包记下触发它的第一个文件，报错时能直接指出是哪个改动要求了 changeset。
const touched = new Map();
for (const file of changed) {
  const m = file.match(/^packages\/([^/]+\/[^/]+)\//);
  if (!m) continue;
  const pkg = packages.get(m[1]);
  if (!pkg || pkg.private) continue;
  const relative = file.slice(`packages/${m[1]}/`.length);
  if (isIgnoredInPackage(relative, pkg)) continue;
  if (!touched.has(pkg.name)) touched.set(pkg.name, relative);
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

const uncovered = [...touched.keys()]
  .filter((name) => !declared.has(name))
  .sort();

const summaryPath = process.env.GITHUB_STEP_SUMMARY;
const write = (text) => {
  console.log(text);
  if (summaryPath) fs.appendFileSync(summaryPath, `${text}\n`);
};

if (SKIP_LABEL === 'true') {
  write('### Changeset check');
  write('');
  write('PR 带有 `release:skip` label，已记录「本次不发版」的决定。');
  if (uncovered.length) {
    write('');
    write(`被跳过的包：${uncovered.map((n) => `\`${n}\``).join('、')}`);
  }
  process.exit(0);
}

write('### Changeset check');
write('');

if (!touched.size) {
  write('本次没有改动可发布 package 的产物代码。');
  process.exit(0);
}

if (!uncovered.length) {
  write(
    `改动的可发布 package 都已声明 changeset：${[...touched.keys()].map((n) => `\`${n}\``).join('、')}`,
  );
  process.exit(0);
}

write('以下 package 有产物改动但没有对应 changeset：');
write('');
for (const name of uncovered) {
  write(`- \`${name}\`（如 \`${touched.get(name)}\`）`);
}
write('');
write('运行 `pnpm changeset` 补一份，勾选上面列出的包。');
write('');
write(
  '如果这次改动确实不需要发版——比如纯重构、或回滚一个尚未发布的改动——给 PR 加 `release:skip` label，并在描述里说明原因。',
);

for (const name of uncovered) {
  console.log(`::error::${name} 有产物改动但缺少 changeset`);
}

process.exit(1);
