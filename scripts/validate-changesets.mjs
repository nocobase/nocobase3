// 校验 .changeset/*.md 的格式。这一层是阻塞性的：文件本身写错了，机器能
// 确定判断，没有让它流到发版时才炸的理由。
//
// 只检查已经存在的文件是否合法，不判断「该不该有 changeset」——那是
// advise-changesets.mjs 的职责，且只提醒不阻塞。
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const changesetDir = path.join(root, '.changeset');
const VALID_BUMPS = new Set(['patch', 'minor', 'major']);

// packages/ 是两层的：packages/<分类>/<包>，分类目录本身没有 package.json。
// 只读一层会得到空集合，于是每个 changeset 里的包名都会被判成「未知的包名」。
function readWorkspacePackages() {
  const packagesDir = path.join(root, 'packages');
  const names = new Set();
  if (!fs.existsSync(packagesDir)) return names;
  for (const category of fs.readdirSync(packagesDir, { withFileTypes: true })) {
    if (!category.isDirectory()) continue;
    const categoryDir = path.join(packagesDir, category.name);
    for (const entry of fs.readdirSync(categoryDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const manifest = path.join(categoryDir, entry.name, 'package.json');
      if (!fs.existsSync(manifest)) continue;
      names.add(JSON.parse(fs.readFileSync(manifest, 'utf8')).name);
    }
  }
  return names;
}

const known = readWorkspacePackages();
const errors = [];

if (!fs.existsSync(changesetDir)) {
  console.log('没有 .changeset 目录，跳过。');
  process.exit(0);
}

const files = fs
  .readdirSync(changesetDir)
  .filter((f) => f.endsWith('.md') && f !== 'README.md');

for (const file of files) {
  const full = path.join(changesetDir, file);
  const raw = fs.readFileSync(full, 'utf8');

  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    errors.push(`${file}: 缺少 YAML frontmatter`);
    continue;
  }

  const body = raw.slice(match[0].length).trim();
  if (!body) {
    errors.push(`${file}: 缺少变更说明正文`);
  }

  const lines = match[1].split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) {
    errors.push(`${file}: frontmatter 为空，至少要声明一个包`);
    continue;
  }

  for (const line of lines) {
    const entry = line.match(
      /^\s*(?:"([^"]+)"|'([^']+)'|([^:]+?))\s*:\s*(.+?)\s*$/,
    );
    if (!entry) {
      errors.push(`${file}: 无法解析的声明 -> ${line.trim()}`);
      continue;
    }
    const name = (entry[1] ?? entry[2] ?? entry[3]).trim();
    const bump = entry[4].replace(/^["']|["']$/g, '').trim();

    if (!known.has(name)) {
      errors.push(`${file}: 未知的包名 "${name}"`);
    }
    if (!VALID_BUMPS.has(bump)) {
      errors.push(
        `${file}: 非法的 bump 类型 "${bump}"（只允许 patch / minor / major）`,
      );
    }
  }
}

if (errors.length) {
  console.error('changeset 校验失败：\n');
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(`changeset 校验通过（${files.length} 个文件）。`);
