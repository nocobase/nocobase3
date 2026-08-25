// 列出 workspace 里所有 package 的名字和版本，供发版 workflow 使用。
//
// 用法：
//   node scripts/list-package-versions.mjs            输出 JSON
//   node scripts/list-package-versions.mjs --table     输出 markdown 表格（跳过 private）
//   node scripts/list-package-versions.mjs --prerelease 只列出带预发布后缀的
//   node scripts/list-package-versions.mjs --changed <前值JSON文件>  列出版本号变了的
//   node scripts/list-package-versions.mjs --candidates 列出可发布包的 name@version
//   node scripts/list-package-versions.mjs --released <前值JSON文件>  列出本次发布的包，
//                                          飞书通知用，每行 `name  version`
import fs from 'node:fs';
import path from 'node:path';

const PACKAGES_DIR = 'packages';

export function readPackages() {
  const out = [];
  if (!fs.existsSync(PACKAGES_DIR)) return out;
  for (const dir of fs.readdirSync(PACKAGES_DIR)) {
    const file = path.join(PACKAGES_DIR, dir, 'package.json');
    if (!fs.existsSync(file)) continue;
    const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
    out.push({
      dir,
      file,
      name: pkg.name,
      version: pkg.version,
      private: !!pkg.private,
    });
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
} else if (mode === '--released') {
  // 只列版本号真的变了的包 —— 那才是本次实际发布的内容。
  const beforeFile = process.argv[3];
  if (!beforeFile) {
    console.error('--released 需要指定前值 JSON 文件');
    process.exit(2);
  }
  const before = JSON.parse(fs.readFileSync(beforeFile, 'utf8'));
  const released = packages.filter(
    (p) => !p.private && before[p.name] !== p.version,
  );
  const width = Math.max(0, ...released.map((p) => p.name.length));
  console.log(
    released.map((p) => `${p.name.padEnd(width)}  ${p.version}`).join('\n'),
  );
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
