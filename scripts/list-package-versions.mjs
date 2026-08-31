// 列出 workspace 里所有 package 的名字和版本，供发版 workflow 使用。
//
// 用法：
//   node scripts/list-package-versions.mjs            输出 JSON
//   node scripts/list-package-versions.mjs --table     输出 markdown 表格（跳过 private）
//   node scripts/list-package-versions.mjs --prerelease 只列出带预发布后缀的
//   node scripts/list-package-versions.mjs --changed <前值JSON文件>  列出版本号变了的
//   node scripts/list-package-versions.mjs --candidates 列出可发布包的 name@version
//   node scripts/list-package-versions.mjs --released-specs <前值JSON文件>  同上，但一行一个
//                                          name@version，供脚本消费
//   node scripts/list-package-versions.mjs --released-rows <前值JSON文件>  列出本次发布的包，
//                                          输出 [{pkg,ver}] JSON，供飞书卡片表格消费
//   node scripts/list-package-versions.mjs --filters <前值JSON文件>   本次发布的包及其
//                                          依赖的 pnpm --filter 参数
import fs from 'node:fs';
import path from 'node:path';

const PACKAGES_DIR = 'packages';

// packages/ 是两层的：packages/<分类>/<包>，分类目录自己没有 package.json，所以要下钻一层才能读到包。
// 只读一层会得到空列表，而发版 workflow 靠这里算「这次发了什么」，读空了就会静默发布空集。
// 返回的 dir 是相对 packages/ 的路径（如 libs/app-database），不是裸包名。
export function readPackages() {
  const out = [];
  if (!fs.existsSync(PACKAGES_DIR)) return out;
  for (const category of fs.readdirSync(PACKAGES_DIR, {
    withFileTypes: true,
  })) {
    if (!category.isDirectory()) continue;
    const categoryDir = path.join(PACKAGES_DIR, category.name);
    for (const entry of fs.readdirSync(categoryDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const file = path.join(categoryDir, entry.name, 'package.json');
      if (!fs.existsSync(file)) continue;
      const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
      out.push({
        dir: `${category.name}/${entry.name}`,
        file,
        name: pkg.name,
        version: pkg.version,
        private: !!pkg.private,
      });
    }
  }
  return out;
}

const mode = process.argv[2];
const packages = readPackages();

if (mode === '--table') {
  console.log('| Package | 版本 |');
  console.log('| --- | --- |');
  for (const p of packages) {
    if (p.private) continue;
    console.log(`| \`${p.name}\` | \`${p.version}\` |`);
  }
} else if (mode === '--prerelease') {
  console.log(
    packages
      .filter((p) => p.version.includes('-'))
      .map((p) => `${p.name}@${p.version}`)
      .join(' '),
  );
} else if (mode === '--changed') {
  const beforeFile = process.argv[3];
  if (!beforeFile) {
    console.error('--changed 需要指定前值 JSON 文件');
    process.exit(2);
  }
  const before = JSON.parse(fs.readFileSync(beforeFile, 'utf8'));
  const changed = packages
    .filter((p) => before[p.name] !== p.version)
    .map((p) => `${p.name}: ${before[p.name]} -> ${p.version}`);
  console.log(changed.join('\n'));
} else if (mode === '--released-rows') {
  // 本次实际发布的包，输出飞书卡片 table 组件的 rows。
  //
  // 卡片 2.0 的表格要的是结构化数据而不是 Markdown 文本：Markdown 表格语法
  // 在卡片里只会原样显示成一堆竖线，这正是之前通知里表格没渲染出来的原因。
  const beforeFile = process.argv[3];
  if (!beforeFile) {
    console.error('--released-rows 需要指定前值 JSON 文件');
    process.exit(2);
  }
  const before = JSON.parse(fs.readFileSync(beforeFile, 'utf8'));
  console.log(
    JSON.stringify(
      packages
        .filter((p) => !p.private && before[p.name] !== p.version)
        .map((p) => ({ pkg: p.name, ver: p.version })),
    ),
  );
} else if (mode === '--released-specs') {
  // 本次实际发布的包，一行一个 `name@version`。
  //
  // `--released-rows` 是 JSON，`--candidates` 则包含了本次没发布的包。补打 dist-tag
  // 需要的是「这次真的发出去了什么」，所以单独给一个直接可被 shell 逐行读取的格式。
  const beforeFile = process.argv[3];
  if (!beforeFile) {
    console.error('--released-specs 需要指定前值 JSON 文件');
    process.exit(2);
  }
  const before = JSON.parse(fs.readFileSync(beforeFile, 'utf8'));
  for (const p of packages) {
    if (p.private) continue;
    if (before[p.name] === p.version) continue;
    console.log(`${p.name}@${p.version}`);
  }
} else if (mode === '--filters') {
  // 拼成 pnpm 的 filter 参数：`--filter <name>...` 表示这个包连同它依赖的包。
  // 发版只需要构建将要发布的包和它们依赖的东西，其余的构建了也用不上。
  const beforeFile = process.argv[3];
  if (!beforeFile) {
    console.error('--filters 需要指定前值 JSON 文件');
    process.exit(2);
  }
  const before = JSON.parse(fs.readFileSync(beforeFile, 'utf8'));
  const changed = packages.filter((p) => before[p.name] !== p.version);
  console.log(changed.map((p) => `--filter ${p.name}...`).join(' '));
} else if (mode === '--candidates') {
  for (const p of packages) {
    if (p.private) continue;
    console.log(`  ${p.name}@${p.version}`);
  }
} else {
  console.log(
    JSON.stringify(
      Object.fromEntries(packages.map((p) => [p.name, p.version])),
    ),
  );
}
