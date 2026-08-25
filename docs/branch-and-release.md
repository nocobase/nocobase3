---
title: Branch and Release
description: NocoBase 3 的分支模型、Changesets 独立版本和发布流程设计
---

# Branch and Release

> 状态：提案。本文描述 NocoBase 3 的目标流程；对应 Changesets 配置和 GitHub Actions 尚未落地。
>
> 文中标注「已验证」的行为，都在 `test-branch-version` 沙盒仓库用 `@changesets/cli` 3.0.1 实测过。该仓库的依赖形状对齐本仓库，实验脚本可重复运行。

## 快速上手：你实际要敲什么

先看命令，模型和取舍在后面章节。

### 普通开发者只需要一条命令

```bash
pnpm changeset
```

写一张纸条，声明这次改动该升 patch / minor / major，跟代码一起提交。**其余命令都由 CI 执行，日常开发不需要敲。**

完整的命令分工：

| 命令                       | 干什么                         | 改版本号吗 | 谁来跑                 |
| -------------------------- | ------------------------------ | ---------- | ---------------------- |
| `pnpm changeset`           | 写纸条，声明 bump 级别         | 否         | **开发者**，每个 PR    |
| `pnpm changeset version`   | 吃掉所有纸条，算出并写入版本号 | **是**     | CI，发版时             |
| `pnpm changeset publish`   | 推 npm，打 package tag         | 否         | CI，发版时             |
| `pnpm changeset pre enter` | 让分支进入预发布模式           | 否         | CI，每次转正后自动重进 |
| `pnpm changeset pre exit`  | 准备退出预发布模式             | 否         | CI，转正时             |

唯一需要人工执行 `pre enter` 的时刻是**仓库最初启用这套流程时**——在 `develop` 上跑一次并提交，之后 `merge-beta-to-stable.yml` 会在每次转正后自动重新进入：

```yaml
# merge-beta-to-stable.yml 的最后一步
- name: Re-enter pre mode on develop
  run: |
    git checkout develop
    git merge --no-ff main
    pnpm changeset pre enter beta
    git commit -m "chore: re-enter pre mode for the next line"
    git push origin develop
```

所以从开发者视角看，`develop` 永远处于 pre 模式，`main` 永远不在——这两个状态由 CI 维持，不需要关心。

### 日常开发（每个 PR）

```bash
# 1. 写代码
vim packages/core/src/index.js
git commit -am "feat: 新增导出能力"

# 2. 加 changeset —— 就在同一个 PR 里
pnpm changeset
#    交互式：选包 -> 选 patch/minor/major -> 写说明
#    生成 .changeset/tasty-pandas-shake.md
git add .changeset && git commit -m "chore: add changeset"
```

生成的文件长这样：

<!-- prettier-ignore -->
```md
---
"@nocobase/core": minor
---

Add data export support to the core runtime.
```

**这一步版本号不变。** changeset 只是一张纸条，会一直攒着：

```text
.changeset/
  tasty-pandas-shake.md    <- PR #1 留下的
  quiet-moons-jump.md      <- PR #2 留下的
```

### 第一次发稳定版

**所有稳定版都从 `develop` 转正而来，第一次也不例外。** 代码先在 `develop` 上以 beta 形式发布验证，再转正合进 `main`。

```text
develop  发若干轮 beta         0.2.0-beta.0 -> 0.2.0-beta.1
   |
   |  转正（pre exit + version）
   v
main     首个稳定版            0.2.0
```

所以 `main` 在第一次转正之前是空的——它不发任何版本，也不应该有人直接在上面跑 `changeset version`。这条线上的稳定版全部来自 `develop`。

**首次也走 `merge-beta-to-stable.yml`**，流程与后续每次转正完全相同，没有特殊步骤。

首次转正时 `main` 会远远落后于 `develop`（可能几十上百个 commit），但这不构成问题，已验证：

```text
main 停在初始代码，develop 已发三轮 beta
main 落后 develop 7 个 commit

转正后：core=0.2.0  ui=0.2.0，pre.json 已删除
合进 main：无冲突，main 上 core=0.2.0  ui=0.2.0
main 有 pre.json 吗：没有
```

因为 `main` 是 `develop` 的祖先，这是一次快进合并，不会有冲突。

合并完成后点 `release-stable.yml` 发布到 `latest`。

第一次转正之后，`main` 才开始承担它的日常职责——接收线上问题的补丁修复（见「线上出 bug，在 main 上修」）。

### 在 develop 发预览版

**点一次 `release-beta.yml` 的运行按钮即可**，不需要在本地敲命令。

它内部执行的是：

```bash
git checkout -b "release-beta/2026-08-24.1"   # 临时发版分支，避免推送竞争
pnpm changeset version                       # 消费 changeset，算版本号
git commit -am "chore: release 2026-08-24.1"
git push origin "$BRANCH_NAME"
pnpm changeset publish                       # dist-tag 由 pre.json 决定
gh pr merge --merge --delete-branch          # 合回 develop
```

`version` 实际做的事：

```text
core  1.2.0 -> 1.3.0-beta.0     吃掉 minor changeset
ui    3.1.0 -> 3.1.1-beta.0     吃掉 patch changeset
.changeset/*.md 移进 .changeset/pre/，生成 CHANGELOG
```

用户安装：`pnpm add @nocobase/core@beta`

再发下一轮还是点同一个按钮，序号自动 `beta.0` → `beta.1`。

> 仓库最初启用时需要有人在 `develop` 上跑一次 `pnpm changeset pre enter beta` 并提交。之后每次转正后 CI 会自动重新进入，不需要再手工执行。

### 预览版转正成稳定版

分两步：**先点 `merge-beta-to-stable.yml` 完成转正和合并，再人工发布。**

第一步，点一次运行按钮，它内部执行：

```bash
git checkout -b "release/2026-08-24.1"   # 临时发版分支
pnpm changeset pre exit                  # 只改 pre.json 的 mode，版本号不动
pnpm changeset version                   # 这一步才脱掉 -beta 后缀
git commit -am "chore: release 2026-08-24.1"
git tag "release/2026-08-24.1"
# 合进 main，然后 develop 重新 pre enter
```

实测：

```text
pre exit 后：  core 仍是 1.3.0-beta.1，pre.json mode=exit
version 后：   core = 1.3.0，pre.json 被自动删除
```

**`pre.json` 不需要手工删**，`version` 会处理。

workflow 接着完成后半段——合进 `main`，`develop` 重新进 pre：

```bash
git checkout main && git merge develop      # 版本号取 develop 的
git checkout develop
git merge main
pnpm changeset pre enter beta               # 重新进 pre，下一轮开始
```

下一轮从 `1.3.0` 起算，得到 `1.4.0-beta.0`。**不用重切分支。**

第二步，**点一次 `release-stable.yml`**（输入保持默认：`branch=main`）。

它检测到 `main` 上没有待消费的 changeset，就知道版本号已经就绪，直接发布到 `latest`。

**两步分开是有意的。** 合并涉及三条分支的状态变更，需要自动化保证一致；「什么时候把版本推到 npm」是发布决策，由人掌握时机。延后发布是安全的——`changeset publish` 读的是 package.json 的版本号，逐个查 registry 有没有 `name@version`，与 changeset 是否还在无关。

唯一可能需要人介入的是 `develop` 合进 `main` 时出现**源码冲突**——这时 workflow 会停下并报错，由维护者解决后重跑。仅 `package.json` / `CHANGELOG.md` 冲突时规则固定，workflow 会自动处理。

### 线上出 bug，在 main 上修

开发者手上只做两件事：

```bash
git checkout main
vim ...                        # 修复
pnpm changeset                 # 选 patch
```

提 PR 合进 `main`，然后**点一次 `release-stable.yml`**（输入保持默认）。

它检测到有待消费的 changeset，就先算版本号再发布：

```bash
git checkout -b "release/2026-08-24.2"   # 临时发版分支
pnpm changeset version                   # 1.3.0 -> 1.3.1
git commit -am "chore: release 2026-08-24.2"
git tag "release/2026-08-24.2"
pnpm changeset publish                   # -> dist-tag latest
gh pr merge --merge --delete-branch      # 合回 main
gh pr create --base develop              # 另开一个 PR 同步到 develop
```

`main` 全程不进 pre 模式，所以发的是干净的稳定版号。workflow 里有一条反向校验：一旦在 `main` 上发现 `pre.json`，说明 `develop` 的预发布状态被误合进来了，直接中止。

**补丁必须同步回 `develop`**，否则下一次转正会覆盖掉它。workflow 直接 merge 并推送，不走 PR——冲突的解法是确定的，没有需要人 review 的内容。解不了才停下发飞书通知。详见「同步冲突怎么解」。

修复的**代码**同步过去了，会包含在下一个 beta 里；但这份 changeset 已被 `main` 消费，不会在 `develop` 重复发一遍。

### 在旧版本上修 bug

如果要修的是**已经不是最新**的版本（例如 `main` 已到 2.0，但用户还在用 1.3.x）：

```bash
git checkout -b 1.3 release/2026-08-20.1   # 从当时的版本 tag 切
# 修 bug + pnpm changeset（选 patch）
git push origin 1.3
```

然后**点 `release-stable.yml`**，填 `branch=1.3` 并勾上 `keep_latest`。

勾上之后发布到 dist-tag `legacy` 而不是 `latest`，`latest` 指针保持指向主线版本。详见「在已发布的旧版本上修 bug」。

### 没有 changeset 时发版会怎样

已验证（`test-branch-version/experiments/empty-changeset-release.sh`）。

```bash
$ pnpm changeset pre enter beta
$ pnpm changeset version

No unreleased changesets found.
🦋 Exited with code 1
```

版本号不变，`package.json` 无 diff。就算硬跑 `publish` 也发不出东西——它逐包查 registry 里有没有 `name@version`，版本号没变就全部命中「已存在」而跳过。

**但有两个「静默成功」的路径**，退出码是 0 却什么都没做：

| 情况                  | exit code | 实际结果                               |
| --------------------- | --------- | -------------------------------------- |
| 无 changeset 发预览版 | 1         | 安全，直接失败                         |
| 只有 empty changeset  | 0         | 版本号不变，publish 零个包             |
| 转正时这轮从未发过版  | 0         | 版本号不变，**但 `pre.json` 被删掉了** |

第三种最麻烦：自动化流程如果只看退出码，会继续发布零个包、把「什么都没发生」的状态合进 `main`，并让 `develop` 白白退出 pre 模式。所以两个发版 workflow 都在 `version` 前后做版本号快照比对，没有实际变化就中止。

## 背景

NocoBase 2 使用三条长期分支承载三个发布渠道：

| 分支      | 发布阶段 | npm dist-tag |
| --------- | -------- | ------------ |
| `main`    | 稳定版   | `latest`     |
| `next`    | Beta     | `beta`       |
| `develop` | Alpha    | `alpha`      |

代码在 `develop` 或 `next` 开发，按 `develop -> next -> main` 逐步晋级；稳定分支上的修复按反方向回灌。

NocoBase 2 的实现同时耦合了以下操作：

- `release.sh` 根据当前分支计算 alpha、beta 或稳定版本。
- Lerna 通过 `forcePublish` 给所有 workspace package 写入同一个版本。
- release workflow 在多个仓库和多条长期分支之间直接执行 `git merge` 和 `git push`。
- 版本提交、Git tag、分支同步、全仓构建和 npm publish 位于同一条长工作流中。

这种设计能保持所有包和分支版本一致，但也带来了几个问题：

1. 任意小改动都需要重新版本化、构建和发布全部 package。
2. package 数量增加后，发布越来越慢，单包失败也会使整批发布难以恢复。
3. workflow 会直接修改并推送长期分支；发布期间的新提交可能改变构建输入或造成 CI、merge 冲突。
4. 版本号既表达产品发布阶段，又被用来同步整个 monorepo，无法反映单个 package 的真实兼容性。
5. 预发布版本提交会在三条分支之间传播，持续制造 package.json 和 lockfile 冲突。

## 为什么不继续用三条长期分支

本方案曾设计过「保留 develop/next/main 三条长期分支，各自承载 alpha/beta/stable」的形态。在沙盒仓库实测后放弃了该方向，原因是三条常驻分支装同样的内容、算同样的版本基线，会持续产生结构性问题。

### 代价一：预发布模式的连带发布

Changesets 的 prerelease mode（`changeset pre enter`）在计算 release plan 时，会把所有通过 `dependencies`、`optionalDependencies`、`peerDependencies` 依赖本次发布 package 的下游**无条件拉进来**，与 bump 大小无关，且沿依赖链传递到底。

在对齐本仓库依赖形状的沙盒中实测（`test-branch-version/experiments/single-branch-model.sh`），依赖图为 `core <- store <- server <- host`、`core <- ui`、`core <- auth`，只给 `core` 一个 patch changeset：

| 模式       | 被版本化的 package 数 | 实际结果                                        |
| ---------- | --------------------- | ----------------------------------------------- |
| stable     | 1                     | 只有 core                                       |
| snapshot   | 1                     | 只有 core                                       |
| prerelease | 6                     | core、store、auth、server、ui、host 全部 beta.0 |

`core` 改为 major 时，stable 和 snapshot 各变成 4 个（因 `^` 范围失配带一层直接依赖），prerelease 仍是 6 个。

这个行为无法通过配置关闭。`bumpVersionsWithWorkspaceProtocolOnly`、`onlyUpdatePeerDependentsWhenOutOfRange`、`updateInternalDependents` 以及各种 `workspace:` 写法都试过，均无效。根因是 SemVer 语义：预发布版本不满足普通范围（`1.2.1-alpha.0` 不满足 `^1.2.0`），而 `getDependencyVersionRanges` 在判断前会先把 `workspace:^` 展开成 `^1.2.0`。

`devDependencies` 完全免疫，major 也不会级联。所以 `app-template-default` 这类通过 devDependencies 聚合内部包的形态是安全的。

### 代价二：两条线共用基线时争夺同一个版本号

`test-branch-version/experiments/two-branch-cost.sh` 复现：稳定线和测试线从**同一个基线、同一份 changeset** 出发，会算出同一个目标版本。

```text
测试线（pre 模式）发布：core = 1.3.0-beta.0
稳定线发布：          core = 1.3.0

1.3.0-beta.0 < 1.3.0
```

下一轮测试线若仍从 `1.2.0` 基线计算，会得到 `1.3.0-beta.1`，而 `1.3.0` 已作为稳定版发出——更超前的测试线版本号反而落后于稳定版。

修复这个问题需要额外实现「基线推进」：每次稳定线发布后，把测试线上对应 package 的 version 字段改写到新基线。这是纯粹为了对抗模型缺陷而存在的机械补丁。

注意问题的根源是**共用基线**，不是「存在两条分支」。本方案的 `develop` 走下一个版本的号段（`1.3.0-beta.N`），`main` 走当前版本的补丁号（`1.2.x`），两者基线不同，因此不触发这个问题。

### 代价三：pre 状态文件污染

进入 prerelease mode 会在分支上产生 `.changeset/pre.json` 和 `.changeset/pre/` 目录。这些文件一旦随 merge 流回稳定分支，稳定分支也会进入 pre 模式，之后所有发布都变成预发布版本。必须写 CI 规则专门拦截。

### 结论

三项代价同源于一个决定：**让三条常驻分支装同样的内容、算同样的版本基线**。

本方案保留两条常驻分支，但让它们装不同的内容、走不同的号段：代价二消失，代价三降为一条明确的 CI 规则，代价一（连带发布）只影响 `develop`。

## 核心决策

### 两条常驻分支

```text
main      稳定版   -> dist-tag latest
develop   预览版   -> dist-tag beta
```

`main` 承载已发布版本的补丁修复，`develop` 承载下一个版本的新功能开发。

合并 PR 不修改任何 package 的 `version` 字段——版本号只在发布时由 Changesets 计算。

需要说明一个容易误判的参照：Backstage 的文档描述了「main release line」和「next release line」两条发布线，容易让人以为是两条分支；实际查其 `deploy_packages.yml` 只监听 `master` 和 `patch/*`，`master` 上没有 `pre.json`——**它的 next line 是 npm dist-tag，不是分支**。所以「两条发布渠道」不必然对应「两条分支」；本方案选择用分支承载，是因为新功能开发确实需要一个独立的代码线。

### `develop` 常驻，发预览版

`develop` 是第二条常驻分支，承载下一个版本的新功能开发，发布 `X.Y.0-beta.N`，对应 npm dist-tag `beta`。

它与 `main` 的关系：

- **占据不同的版本号段。** `main` 走当前版本的补丁号（`1.2.x`），`develop` 走下一个版本的预发布号（`1.3.0-beta.N`）。两者不争夺版本号，因此不需要任何基线推进补丁。
- **单向为主。** 新功能只进 `develop`；`main` 上的热修复合进 `develop`。`develop` 只在一个版本转正时合回 `main`。
- **只有 `develop` 使用 prerelease mode。** `main` 上永远不存在 `.changeset/pre.json`。

这正是 Vue 的做法。`vuejs/core` 有 `main` 和 `minor` 两条常驻分支：

```text
main   package.json version = 3.5.41      -> dist-tag latest
minor  package.json version = 3.6.0-rc.5  -> dist-tag alpha/beta/rc
```

实测 `minor...v3.6.0-rc.5` 为 `identical`，`minor...v3.6.0-beta.17` 为 `behind 189`——alpha、beta、rc 三个 dist-tag 不是三条分支，而是同一条 `minor` 分支在时间上的三个阶段。

Vue 的 `minor` 分支从未重切：`v3.4.0`、`v3.5.0`、`v3.5.41` 全部是它的祖先（`behind`、`ahead=0`），说明这条分支跨越多个大版本一直复用。

关键区别在于它与被放弃的 develop/next 三分支方案不同：

| 维度         | 本方案的 develop       | 已放弃的 next 分支     |
| ------------ | ---------------------- | ---------------------- |
| 装什么       | 只装下一个版本的新功能 | 主线全部内容，滚动同步 |
| 与主线关系   | 各走各的，转正时合一次 | 持续双向同步           |
| 版本号段     | 独立（`1.3.0-beta.N`） | 与主线争同一个号       |
| 基线推进补丁 | 不需要                 | 必需                   |

差别不在「有几条分支」，而在**两条分支是否装同样的内容、算同样的基线**。

### snapshot 用于一次性预览，不用于持续测试线

Changesets 还提供 snapshot release（`changeset version --snapshot <tag>`）。它产出的版本号形如：

```text
0.0.0-canary-20260822005740
```

实测（`test-branch-version/experiments/what-is-snapshot.sh`）：

```text
0.0.0-canary-20260822005740 > 1.3.0            -> false
satisfies('0.0.0-canary-...', '^1.2.0')        -> false
```

永远以 `0.0.0` 开头，比任何稳定版都小，不参与版本号序列，只能靠 dist-tag 安装。

因此 snapshot 的定位是**「这个 PR 你装一下试试」**——一次性、用完即弃的预览，适合 PR 预览和 nightly 构建。它不能承担「测试版持续迭代、用户长期使用」的职责，因为版本号不递增，用户无法判断新旧，也无法书写依赖范围。

snapshot 的级联规则与 stable 完全一致（共用同一套范围判断），且结果不回写任何分支。

### package 默认独立版本

每个 package 的版本号只表达自身的兼容性，不表达产品发布。不使用 `fixed` 或 `linked` 强制统一版本。

产品层面的版本（例如 `v3.1.0`）由主仓库 Git tag 和 GitHub Release 表达，与单个 package 的 npm 版本解耦。

## 分支规则

### 常驻分支

| 分支      | 承载               | 版本号形态     | dist-tag | pre 模式 |
| --------- | ------------------ | -------------- | -------- | -------- |
| `main`    | 已发布版本的修复   | `1.2.x`        | `latest` | 永不进入 |
| `develop` | 下一个版本的新功能 | `1.3.0-beta.N` | `beta`   | 常驻     |

两条分支都受保护：禁止直接推送，PR 必须通过 CI 和 review。

**`main` 上永远不存在 `.changeset/pre.json`。** 这是稳定线被污染的唯一信号，CI 必须有一条阻塞规则校验。

### 临时分支

| 分支形态     | 用途               | 生命周期                 |
| ------------ | ------------------ | ------------------------ |
| `hotfix/*`   | 紧急修复已发布版本 | 发布后合回 `main` 并删除 |
| `vX` / `X.Y` | 老版本长期维护     | 该版本 EOL 前保留        |

### 日常流转

```text
新功能 PR ──────────────> develop ──(定期发 beta)──> npm @beta
                             ^
                             │ 合并（同步修复）
                             │
修复 PR ────────────────> main ──(发 Version PR)──> npm @latest
```

- 新功能只进 `develop`。
- 修复进 `main`，发布后合进 `develop`。
- `develop` 只在版本转正时合回 `main`（见下节）。

`test-branch-version/experiments/develop-to-main-cycle.sh` 完整验证了这条流转，包括中途 `main` 发热修复的情况：

```text
① develop 进 pre 模式        core = 1.3.0-beta.0   -> beta
② main 热修复                core = 1.2.1          -> latest
   （main 的 pre 模式：否）
③ develop 继续开发           core = 1.3.0-beta.1   -> beta
④ 把 main 合进 develop       core = 1.3.0-beta.1（版本号保持自己的）
```

### 版本转正：develop 合进 main

这是整个流程中最需要注意的一步，已验证。

```bash
git checkout -b "release/2026-08-24.1"   # 临时发版分支
pnpm changeset pre exit                  # 只记录「打算退出」，不改版本号
pnpm changeset version                   # 真正脱掉 -beta.N 后缀，并删除 pre.json
git commit -am "chore: release 2026-08-24.1"
git tag "release/2026-08-24.1"
```

合进 `main` 之后，点 `release-stable.yml` 发布到 `latest`。

两条命令的分工必须理解清楚：

| 命令       | 做什么                                     | 之后 `pre.json`      | 版本号                   |
| ---------- | ------------------------------------------ | -------------------- | ------------------------ |
| `pre exit` | 把 `mode` 从 `pre` 改成 `exit`，仅记录意图 | 仍存在，`mode: exit` | 不变                     |
| `version`  | 消费所有 changeset，脱掉预发布后缀         | **被自动删除**       | `1.3.0-beta.1` → `1.3.0` |

实测输出：

```text
预览版：      core = 1.3.0-beta.0   pre.json: mode=pre tag=beta
pre exit 后： pre.json: mode=exit   版本号还没变: core = 1.3.0-beta.0
version 后：  core = 1.3.0          pre.json: 不存在
```

**关键：`pre.json` 由 `changeset version` 自动删除，不需要手工处理。** 所以转正后的 `develop` 已经是干净的非 pre 状态，可以安全合进 `main`。

合并时 `package.json` 会冲突，此时版本号取 **develop 的**——它才是转正后的稳定版号，而 `main` 上还是转正前的旧版本。

这与日常 `main` → `develop` 的同步规则一致：两边都是**取较大者**。转正时 develop 刚脱掉 `-beta` 后缀，必然大于 `main` 的旧版本；日常同步时则可能是 `main` 更大（它连发了 hotfix），那就接受 `main` 的。详见「同步冲突怎么解」。

合并后必须验证 `main` 上没有 `pre.json`。

### develop 不需要重新切出来

转正合并后，`develop` **直接复用，不重切**，已验证（`test-branch-version/experiments/develop-reuse.sh`）。

`changeset version` 已经删掉了 `pre.json`，分支回到干净状态。开下一轮只需：

```bash
git merge main                # 同步转正结果
pnpm changeset pre enter beta # 重新进入 pre 模式
```

实测第二轮从新的稳定基线继续计算，顺序天然正确：

```text
第一轮转正：      core = 1.3.0
重新 pre enter：  pre.json: mode=pre tag=beta
第二轮预览版：    core = 1.4.0-beta.0
1.4.0-beta.0 > 1.3.0
```

Vue 的做法是同样的：`v3.4.0`、`v3.5.0`、`v3.5.41` 全部是 `minor` 分支的祖先，说明这条分支跨多个大版本一直复用，从未重切。

一个细节：`pre exit` 之后 `.changeset/pre/` 会残留一个**空目录**（记录文件已被 `version` 消费清空）。它不影响下一轮，删不删都可以。

### 忘记 pre exit 的后果

如果 `develop` 在 pre 模式下直接合进 `main`：

- `main` 的 package.json 会带上 `-beta.N` 版本号；
- `pre.json` 进入 `main`，此后 `main` 上所有发布都变成预发布版本。

这是必须用 CI 拦截的场景，也是「`main` 上不得出现 `pre.json`」这条规则存在的原因。

### 稳定版修复同步到 develop

`main` 发布修复后 merge 回 `develop`，必然在两类文件上冲突：

```text
packages/<name>/package.json     版本号
packages/<name>/CHANGELOG.md     发布记录
```

`main` 发布时已经消费掉了修复的 changeset 文件，合过来时 `.changeset/` 里没有它，因此**不会在 develop 上重复发布**。但代码修复合过来了，会包含在下一个 beta 中。

#### 同步冲突怎么解

由 `scripts/resolve-sync-conflicts.mjs` 自动处理，已验证（`test-branch-version/experiments/sync-conflict-resolution.sh`）：

| 文件           | 规则                                            |
| -------------- | ----------------------------------------------- |
| `package.json` | 版本号**取较大者**，其余字段走 git 正常三方合并 |
| `CHANGELOG.md` | union，两边条目都保留                           |
| 其它任何文件   | 不碰，中止并发飞书通知                          |

**为什么版本号取较大者而不是无条件保留 develop 的。** 如果 `main` 连发几个 hotfix，develop 会落后并且永远追不上，已验证：

```text
develop 发一轮 beta        1.3.1-beta.0
main 连发两个 hotfix       1.3.2
                           1.3.1-beta.0 < 1.3.2   <- beta 渠道低于 latest

保留 develop 自己的（--ours）：
  下一轮                   1.3.1-beta.1 < 1.3.2   <- 仍然倒挂

取较大者（接受 main 的 1.3.2）：
  下一轮                   1.3.3-beta.0 > 1.3.2   <- 顺序恢复
```

原因在于基线钉死时只有序号在涨。接受 `main` 的版本号后基线抬到 `1.3.2`，序号也自然从 `.0` 重新开始（`1.3.2` 里没有预发布序号可读）。

develop 领先时则保留自己的：

```text
develop 1.4.0-beta.0  vs  main 1.3.2  ->  保留 1.4.0-beta.0
```

不需要区分 minor 还是 patch，semver 比较本身涵盖了这一点。

**为什么不整个文件取一边。** `package.json` 可能同时有版本号之外的改动。脚本的做法是把 base/ours/theirs 三份的 `version` 都改写成胜出值，再跑 `git merge-file` 做三方合并——版本号不再是冲突点，其余字段照常合并。实测：

```text
develop: version=1.3.1-beta.0，新增 dependencies.lodash
main:    version=1.3.2
结果:    version=1.3.2  deps={"lodash":"^4.0.0"}    <- 两个都对
```

如果合并后仍有冲突标记，说明真有别的字段冲突，交给人。

**已发布的 beta 不受影响。** develop 版本号跳变后，之前发的 `1.3.1-beta.0` 在 npm 上照常存在，它的 tag 也仍指向当时的 commit 且在 develop 历史里。只是版本号序列不连续——`1.3.1` 那条线被 `main` 的 hotfix 接管了，develop 让开是正确行为。

### 在已发布的旧版本上修 bug

场景：`main` 已经走到 `2.0.0`，但线上还有用户在用 `1.3.x`，需要给 `1.3.x` 出补丁。已验证（`test-branch-version/experiments/patch-old-version.sh`）。

```bash
# ① 从当时的版本 tag 切分支 —— 不是从 main 切
git checkout -b 1.3 release/2026-08-20.1

# ② 修 bug + changeset（选 patch）
pnpm changeset

# ③ 推分支
git push origin 1.3
```

然后点 `release-stable.yml`，填 `branch=1.3` 并**勾上 `keep_latest`**。

**`keep_latest` 是必须勾的。** 不勾的话 `1.3.1` 会抢走 `latest`，用户 `pnpm add @nocobase/core` 会从 `2.0.0` 退回 `1.3.1`。workflow 里有一条校验：从非 `main` 分支发版却没勾 `keep_latest` 时直接报错，不会让你误发。

勾上之后发布到 dist-tag `legacy`，两条线互不干扰：

```text
latest  -> 2.0.0      npm install @nocobase/core 拿到这个
legacy  -> 1.3.1      旧版本线的最新补丁
```

#### dist-tag 只影响一种人

这一点容易误解：**dist-tag 只对 `npm install <pkg>` 不写版本号的人生效。**

写了 range 的用户按 semver 从版本列表解析，根本不看 dist-tag：

```text
registry 上 @nocobase/core 的版本：1.2.0, 1.2.4, 1.3.0, 1.3.1, 2.0.0

用户 package.json 写法      解析到
  ^1.3.0                    1.3.1     <- 拿到 hotfix
  ~1.3.0                    1.3.1     <- 拿到 hotfix
  1.3.x                     1.3.1     <- 拿到 hotfix
  ^2.0.0                    2.0.0
```

所以老用户不管 dist-tag 叫什么都能正常升级到补丁版本。`legacy` 这个值本身没有语义要求，它的唯一作用是**给这次发布一个不是 `latest` 的落点**，避免 `latest` 指针倒退。

这也是为什么不需要按版本线设计 `v1-latest`、`v2-latest` 这类名字——各 package 独立版本，同一批发布里 core 可能是 1.x 而 hub 是 2.x，一个按主版本号命名的 tag 套不住它们。

维护分支的特点：

- 从**版本 tag** 切出，不是从 `main` 切
- **不进 pre 模式**，直接发该号段的稳定版号
- 发版时**必须勾 `keep_latest`**
- 与 `main` 各走各的号段，不需要同步
- 该版本 EOL 后删除分支即可

### 旧版本的修复要不要合回 main

分两种情况：

| 情况                 | 做法                                                 |
| -------------------- | ---------------------------------------------------- |
| 问题在新版本已不存在 | 不用合，维护分支自己留着                             |
| 问题在新版本依然存在 | cherry-pick 代码，在 `main` 上**新写一个 changeset** |

**不要直接 merge 维护分支到 `main`。** 它带着 `1.3.1` 这个版本号，合过去会与 `main` 的 `2.0.0` 冲突；而且那份 changeset 已经被维护分支消费掉了，不会在 `main` 上再产生一次版本变更。

正确做法：

```bash
git checkout main
git cherry-pick -n <fix-sha>
rm .changeset/fix.md          # 丢掉维护分支带过来的 changeset（如果有）
pnpm changeset                # 在 main 上重新写一份
# -> 2.0.0 -> 2.0.1
```

## Changeset 开发流程

### 普通变更

修改可发布 package 时，在同一个功能 PR 中执行：

```bash
pnpm changeset
```

交互式选择受影响 package、SemVer 级别和变更说明，生成 `.changeset/<random-name>.md`：

<!-- prettier-ignore -->
```md
---
"@nocobase/app-portal-sdk": minor
"@nocobase/hub": patch
---

Add a new Portal extension API and update the built-in Hub integration.
```

changeset 描述的是本次代码变更的发布影响，不是一次实际发布操作。多个功能 PR 的 changeset 会被同一次发布一起消费。

推荐粒度是「每个需要发布的 PR 一份」，不是每个 commit 一份。

**开发者不修改 package.json 的 `version` 字段。** 添加 changeset 不等于立即发版；它可以在仓库中等待数天，与其他 PR 的 changeset 一起被后续的发布汇总。

### 版本号是怎么算出来的

一条公式：

```text
目标版本 = 稳定基线 + 本条 pre 线上累积的最高 bump
预发布号 = 当前版本里的序号 + 1
```

**不是**「上一个 beta 版本 + 这次的 bump」。理解这一点能解释后面所有看起来奇怪的行为。

「稳定基线」是 package.json 里那个不带预发布后缀的版本号——它只在转正时被改写。「累积的最高 bump」来自 `.changeset/pre/` 目录，那里存着本条 pre 线上所有已消费的 changeset，每次 `version` 都重新读一遍。

起点 `A = 1.3.0`（刚转正完，重新进入 pre 模式），已验证（`test-branch-version/experiments/version-calculation.sh`）：

| 轮次 | 本轮新增 changeset | `.changeset/pre/` 累积 | 最高 bump | 结果           |
| ---- | ------------------ | ---------------------- | --------- | -------------- |
| 1    | patch              | p1                     | patch     | `1.3.1-beta.0` |
| 2    | patch              | p1 p2                  | patch     | `1.3.1-beta.1` |
| 3    | patch              | p1 p2 p3               | patch     | `1.3.1-beta.2` |
| 4    | minor              | p1 p2 p3 m1            | minor     | `1.4.0-beta.3` |

几个直接推论：

**连续发 patch，`x.y.z` 不会一直往上走。** 第 2 轮是 `1.3.1-beta.1` 而不是 `1.3.2-beta.0`——基线还是 `1.3.0`，最高 bump 还是 patch，目标版本仍然是 `1.3.1`，只有序号递增。

**加再多 changeset 也不会抬高目标版本。** 三个 patch 的效果和一个 patch 完全相同。这正是早期方案里需要「基线推进」补丁的原因：只要基线不动，目标版本就钉死在那里。

**换 bump 类型时 `x.y.z` 跳变，序号不归零。** 第 4 轮从 `1.3.1-beta.2` 变成 `1.4.0-beta.3`，`1.4.0-beta.0/1/2` 被永久跳过。

**转正会重置序号。** 转正后版本号里没有 `-beta.N` 了，`getPreVersion` 读到 `undefined`，下一轮从 `.0` 重新开始：

```text
1.3.0-beta.1  --转正-->  1.3.0  --下一轮 patch-->  1.3.1-beta.0
```

**这一轮没改动的包原地不动。** 只给 B 写 changeset 时，A 保持转正后的稳定版号，不会因为同批发版而跟着进位。

最终转正的结果同样按这条公式算：

```text
基线 1.3.0 + 累积的最高 bump（minor） = 1.4.0
```

三个 patch 加一个 minor，最终是 `1.4.0`，不是累加四次的 `1.3.3` 或 `1.4.3`。

### 预发布序号的实现细节

changeset 里写的 `patch`/`minor`/`major` 指的永远是 SemVer 的三位，与预发布序号（`-beta.N` 里的 N）无关。

序号由 Changesets 自己维护，不是 NocoBase 的逻辑。算法在 `@changesets/assemble-release-plan`：

```text
getPreVersion(version) = semverParse(version).prerelease[1] ?? -1，然后 +1
```

即「读当前 package.json 版本里的序号，加一」。这解释了上一节表格里的两个现象：

- **不因 `x.y.z` 变化而归零**，所以换 bump 类型时会跳号
- **转正后从 `.0` 重新开始**，因为转正后的版本号里没有序号可读，取到 `undefined`

跳号不影响正确性（`1.4.0-beta.3 > 1.3.1-beta.2` 仍然成立），只是号段不连续。Changesets 选择不归零，是为了让同一 package 的预发布序号在整条 pre 线上单调递增，不依赖 base 版本的走向；否则删改 `.changeset/pre/` 中的文件导致 base 版本回退时，会与已发布版本冲突。

序号按 package 各自计算，不同 package 之间互不影响。

### 不需要发布的变更

纯文档、测试、内部工具或不影响发布产物的变更可以：

- 什么也不做，接受 changeset advisory 提醒；
- 添加 `release:skip` PR label 并记录原因；或
- 提交 empty changeset。

CI 不应根据 diff 自动猜测 bump 级别。它可以发现「缺少 changeset」，但公开 API 是否 breaking 必须由开发者和 reviewer 决定。

因此缺少 changeset 的检测是 **advisory check，始终以成功状态结束**；只有已提交的 changeset 本身有错误（无效 YAML、未知 package、非法 bump）时，validation check 才失败。

### 多包协调变更

同一份 changeset 可以给不同 package 指定不同 bump：

<!-- prettier-ignore -->
```md
---
"@nocobase/app-template-default": major
"@nocobase/app-portal-sdk": major
"@nocobase/hub": minor
---

Prepare app-template-default 3.0 and its supporting runtime APIs.
```

Changesets 会合并同一次发布中的所有声明，按每个 package 的最高 bump 计算版本。

### 依赖方是否自动发布

假设 package B 依赖 package A，功能 PR 只给 A 添加 changeset。**结论取决于发布渠道**。

`main` 上的稳定发布，B 通过 `dependencies` 依赖 A（已验证）：

| 场景                                           | release plan                                       |
| ---------------------------------------------- | -------------------------------------------------- |
| A 从 `1.2.0` patch 到 `1.2.1`，B 依赖 `^1.2.0` | 只发布 A；B 的范围仍满足                           |
| A 从 `1.2.0` minor 到 `1.3.0`，B 依赖 `^1.2.0` | 只发布 A；B 的范围仍满足                           |
| A 从 `1.2.0` major 到 `2.0.0`，B 依赖 `^1.2.0` | A 超出范围，自动更新 B 的依赖范围并给 B 一个 patch |
| B vendor、bundle 或再导出 A 的代码/类型        | 依赖图无法识别，必须显式给 B 添加 changeset        |

B 通过 `devDependencies` 依赖 A 时，以上四种情况都不会让 B 进入 release plan，major 也不例外。

stable 渠道的级联只在范围失配时发生，且**只传播一级**：

```text
依赖链：core -> store -> server -> host

stable，core major：
  core  1.2.0 -> 2.0.0
  store 1.0.0 -> 1.0.1
  server / host 不发布
```

`develop`（prerelease mode）上，只要 B 通过 `dependencies`、`optionalDependencies` 或 `peerDependencies` 依赖 A，**无论 bump 大小 B 都会被连带发布**，并沿依赖链传递到底：

```text
prerelease，core 任意 bump：
  core、store、server、host 全部进入 release plan
```

这是选择「`develop` 用 pre 模式」必须接受的代价。相比三分支方案，危害小得多：`develop` 本来就是「一批新功能一起发」的性质，且每个版本转正时会清空一次预发布状态。但它确实意味着 `develop` 上每次发 beta 都会带上全部下游包，需要确认可接受。

在 stable 渠道，「只写 A」不保证 B 一定发布，也不应该保证：只要 B 已发布的依赖范围仍兼容 A，重新发布 B 只是制造无意义版本。

责任边界：

- Changesets 能自动处理的是 manifest 范围越界。
- A 的作者需要评估已知的行为、API 和类型影响；需要修改 B 时在同一个 PR 中修改，并根据是否需要发布决定是否添加 changeset。
- CI 根据依赖图把 B 和其他 dependents 加入验证集合。即使 A 的作者漏判，只要 B 的类型检查、测试或构建能覆盖该兼容关系，PR 就会失败。
- 依赖范围仍兼容、B 不需要改代码且验证通过时，B 不发布是正确结果。

## 发布流程

稳定版有两种来源：

| 来源              | 场景   | 前提                             |
| ----------------- | ------ | -------------------------------- |
| 从 `develop` 转正 | 新版本 | 该版本已在 `develop` 上发过 beta |
| 在 `main` 上修复  | 补丁   | `main` 上已有至少一次转正结果    |

**新代码永远先进 `develop`。** `main` 只承载「已发布版本的修复」，不承载新功能，也不是任何版本的起点——包括第一个版本（见「第一次发稳定版」）。

### 预览版发布（develop）

```bash
# 首次进入
pnpm changeset pre enter beta

# 每一轮发布
pnpm changeset version
git commit -am "chore: release 2026-08-24.1"
pnpm changeset publish              # dist-tag 由 pre.json 决定
```

**pre 模式下不能带 `--tag`**，changeset 会直接拒绝：

```text
Releasing under custom tag is not allowed in pre mode!
```

dist-tag 由 `.changeset/pre.json` 的 `tag` 字段决定——`pre enter beta` 时定的就是 `beta`，`publish` 自动用它。

`publish` 会为实际发布成功的每个 package 打 `name@version` tag。不打产品级 tag，理由见「不打产品级 tag」。

### 稳定版补丁发布（main）

首次转正之后，`main` 上的 hotfix 走 `release-stable.yml`，不涉及 pre 模式。

开发者提交修复和 changeset 到 `main`，然后触发 workflow（输入保持默认）。它内部执行：

```bash
git checkout -b "release/2026-08-24.2"
pnpm changeset version                   # 1.3.0 -> 1.3.1
git commit -am "chore: release 2026-08-24.2"
git tag "release/2026-08-24.2"
pnpm changeset publish                   # -> dist-tag latest
gh pr merge --merge --delete-branch      # 合回 main
git checkout develop && git merge main   # 直接同步，不走 PR
node scripts/resolve-sync-conflicts.mjs  # 自动解冲突
git push origin develop
```

版本序号与转正共用 `release/` 前缀和序号空间——两者都发 `latest`，是同一条稳定线上的连续版本。

守卫：

- **不得存在 `pre.json`**：出现说明 `develop` 的预发布状态被误合进来，继续跑会把补丁发成预发布版本。
- **不得产生预发布版本号**：出现说明 changeset 写错了或上游状态有问题。
- **从非 `main` 分支发版必须勾 `keep_latest`**：否则旧版本会抢走 `latest` 指针。

### 版本转正（develop → main）

转正分两步：**合并由 `merge-beta-to-stable.yml` 完成，发布由人工执行。**

第一步，workflow 内部：

```bash
# 在临时发版分支上
pnpm changeset pre exit
pnpm changeset version        # 脱掉 -beta.N，同时删除 pre.json
git commit -am "chore: release 2026-08-24.1"

# 合进 main（package.json 版本号取 develop 的）
# 合并后校验 main 上没有 pre.json

# develop 开下一轮，不重切分支
git merge main
pnpm changeset pre enter beta
```

第二步，点 `release-stable.yml`（输入保持默认）发布到 `latest`。

**为什么分两步：** 转正合并涉及三条分支的状态变更（发版分支、`main`、`develop`），自动化能保证它们一致；而「什么时候把版本推到 npm」是发布决策，与代码状态无关，交给人掌握时机。

延后发布是安全的——`changeset publish` 遍历 workspace 的 package.json 逐个查 registry 有没有 `name@version`，与 changeset 是否还在无关（源码 `getUnpublishedPackages`）。合并完成后随时可以发。

详见[版本转正：develop 合进 main](#版本转正develop-合进-main)。

### 一次性预览发布（snapshot）

用于 PR 预览或 nightly：

```bash
pnpm changeset version --snapshot canary
pnpm changeset publish --tag canary --no-git-tag
```

**结果不回写任何分支。** CI 在临时工作区执行 version、publish，然后丢弃工作树。

用户安装：

```bash
pnpm add @nocobase/app-portal-sdk@canary
```

### 紧急 Hotfix（不走 main 直接发）

绝大多数修复直接在 `main` 上做即可（见上文）。只有需要绕过 `main` 当前状态时才切临时分支：

```text
1. 从最近的发布 tag 切出 hotfix/<描述>
2. 修复 + changeset（patch）
3. changeset version && publish -> dist-tag latest
4. 合回 main，删除分支
5. 把 main 合进 develop（见「稳定版修复同步到 develop」）
```

## Changesets 如何做到按 package 独立发布

机制很朴素，没有隐藏的发布数据库，已验证：

1. `changeset version` 按 changeset 算出每个 package 各自的新版本，写进各自的 package.json。
2. `changeset publish` 遍历所有非 private package，**逐个查询 registry 里存不存在 `name@version`**：已存在就跳过，不存在就 `npm publish` 该 package 目录。
3. 每个发布成功的 package 各自创建一个 Git tag，格式由 `buildGitTag` 决定——monorepo 用 `name@version`，单包仓库用 `vX.Y.Z`。

所以「只发变化的包」不是靠比对 changeset，而是靠 **registry 里已经存在的版本自动被跳过**。没有新 changeset 的 package 版本号没变，它的 `name@version` 已在 registry 中，于是被跳过。

这也是失败重试天然幂等的原因：重跑时已成功的包再次命中「已存在」分支。

### 为什么发版需要一条分支，而不是只打 tag

tag 和分支在 Git 里都只是一个 40 字符的 commit 指针：

```text
tag    ->  8903772922b1d1bfe35c1f2432126d76a1b02aee
branch ->  8903772922b1d1bfe35c1f2432126d76a1b02aee
```

唯一区别是 **branch 会跟着新 commit 移动，tag 不会**。两者解决的是不同问题：

|      | 作用                               | 在发版流程里的角色 |
| ---- | ---------------------------------- | ------------------ |
| tag  | 事后标记「这个 commit 是某次发布」 | 记录结果           |
| 分支 | 提供一个能容纳新 commit 的工作空间 | 隔离过程           |

关键在于 **`changeset version` 会修改文件**：

```text
发版前 core=1.2.0
跑完 changeset version 后 core=1.3.0-beta.0

工作区改动：
   D .changeset/a.md              <- 被消费的 changeset 移进 pre/
   M packages/core/package.json   <- 版本号被改写
```

这些改动必须变成一个 commit，而且**必须落回 `develop`**——否则下次发版会从旧版本号重新起算。tag 只是指针，装不下改动。

所以问题从来不是「要不要打 tag」，而是「`changeset version` 产生的那个 commit 提交到哪里」。

#### 不切分支直接在 develop 上发会怎样

已验证。develop 处于 pre 模式，CI 直接在它上面 `version` + `commit` + `tag`：

```text
① CI checkout develop，core=1.2.0
② version + commit + tag，core=1.3.0-beta.0
   接下来 build + test，耗时几分钟
③ 这期间开发者合了 PR 到 develop
④ CI 推送：
     git push origin develop  -> exit=1  ! [rejected] (fetch first)
     推 tag                   -> exit=0  <- tag 推上去了
```

**分支推送被拒，tag 却推成功了。** 留下的状态：

```text
origin/develop 上 core=1.2.0        <- 还是发版前
tag 里 core=1.3.0-beta.0
tag 在 develop 历史里吗：不在       <- 悬空
```

npm 已发布 `1.3.0-beta.0`，tag 也在，但 `develop` 上没有版本提交。下次发版仍从 `1.2.0` 起算，又算出 `1.3.0-beta.0`，`publish` 发现 registry 已存在就静默跳过——这批改动永远发不出去。

比只推分支失败更糟：多了一个指向孤儿 commit 的 tag，追溯时会误导人。

所以 **tag 要打，分支也要切**，两者不是二选一：分支的价值不在于「多一个分支」，而在于它的推送不与任何人竞争。`develop` 是共享的，随时可能被抢；`release-beta/2026-08-24.1` 只有这次发版在用。

合并后分支删除、tag 留下——**分支是过程，tag 是结果**。

### 发版流程

上面那个失败正是 NocoBase 2 遇到的形态：`publish` 排在 `push` 之前，推送一旦被拒，npm 和仓库就此脱节。

`--force-with-lease` 解决不了——实测同样被拒（`stale info`），它只保证不覆盖别人的提交，不能让推送成功。

完整流程（已验证，`test-branch-version/experiments/concurrent-merge-during-release.sh`）：

```bash
git checkout -b "release-beta/2026-08-24.1"
pnpm changeset version
# build + test
git commit -am "chore: release 2026-08-24.1"
git tag "release-beta/2026-08-24.1"     # 与分支同名，合并前打好
git push origin "refs/heads/$NAME:refs/heads/$NAME"   # 完整 refspec，避免同名歧义
git push origin "refs/tags/$NAME:refs/tags/$NAME"
pnpm changeset publish                  # dist-tag 由 pre.json 决定
git push origin --tags                  # package 级 tag
gh pr create --base develop --head "$BRANCH_NAME"
gh pr merge "$PR_URL" --merge --delete-branch
```

实测对照：

```text
直接在 develop 上发    push -> exit 1（rejected），npm 已发布但仓库没同步
临时发版分支          push -> exit 0，合回无冲突，开发者的 changeset 完好
```

### 合回用 merge，不用 squash，不加 --admin

**`--merge` 而非 `--squash`：** squash 会产生一个新 commit，发版 commit 不在目标分支历史里，`git describe` 失效。发版分支本来只有一个 commit，squash 压缩不了什么。

**不加 `--admin`：** 它会跳过 required checks，也会在冲突时强行合并。冲突虽然少见，但确实存在（见下），强合会把目标分支上刚改的东西冲掉。

冲突时 workflow 停下并发飞书通知，PR 保留等人处理。此时 **npm 已发布成功，状态是安全的**——版本号已经落在 registry，PR 只负责把它写回仓库。

### 合回什么时候会冲突

发版分支只改 `package.json` 的 `version` 字段和 CHANGELOG，所以冲不冲突取决于目标分支这期间有没有碰同一个文件。已验证：

| 目标分支期间做了什么              | 合回时     |
| --------------------------------- | ---------- |
| 只加 changeset + 改源码           | **无冲突** |
| 改了某个包的 `package.json`       | 冲突       |
| 从 `main` 合入 hotfix（版本号变） | 冲突       |

第一种是绝大多数情况。第二种的冲突需要人判断——两边改的是同一个 JSON 对象的不同字段：

```text
<<<<<<< HEAD (develop)
  "version": "1.2.0",
  "dependencies": { "lodash": "^4.0.0" }
=======
  "version": "1.3.0-beta.0",
>>>>>>> release-beta/2026-08-24.1
```

正确结果是两个都要——版本号取发版分支的，依赖取目标分支的。这不能无脑 `--ours` 或 `--theirs`，所以交给人处理。

冲突窗口是「发版开始」到「PR 合回」这几分钟，要恰好有人改了同一个包的 `package.json` 才会撞上，实际发生率很低。

### 不要用 `changeset git-tag` 代替 publish 自动打 tag

两者的判断依据不同：

|                      | 依据                                 | 结果                     |
| -------------------- | ------------------------------------ | ------------------------ |
| `publish` 内部打 tag | **发布成功的包**                     | tag 与 registry 一致     |
| `changeset git-tag`  | 工作区 package.json + tag 是否已存在 | 可能给没发出去的包打 tag |

`publish` 的顺序在源码里很清楚（`publish.mjs:183`）：

```js
if (successfulNpmPublishes.length !== 0) {
  //  ↑ 只收集发布成功的
  gitTagReleases.push(...successfulNpmPublishes.map(...))
}
if (unsuccessfulNpmPublishes.length !== 0) log.error('Some packages failed to publish')
if (gitTagReleases.length > 0) await createGitTags({ releases: gitTagReleases })
//  ↑ 到这一步才打 tag
```

**逐个发布 → 收集成功的 → 只给成功的打 tag → 有失败就 exit 1。**

`git-tag` 则不看发布结果。日常增量发版时它表现正常——版本号没变的包 tag 已存在会被跳过：

```text
第二轮只改 core：
  core=1.1.1  ui=1.1.0  idle=1.1.0
  git-tag 后：3 -> 4 个（只新增 @nb/core@1.1.1）
```

但 publish 部分失败时就会出错，已验证：

```text
第三轮 core + ui 都要发：
  版本算好： core=1.1.2  ui=1.1.1
  publish： core 成功，ui 失败（npm 5xx / 网络中断）
  registry： @nb/core@1.1.2 有，@nb/ui@1.1.1 无

  跑 git-tag：
    @nb/ui@1.1.1   <- 打上了，但 registry 上没有这个版本
```

后果是 tag 声称发布过、registry 上却没有：重试时容易误判已发，`git tag -l` 列出的版本与 npm 不符，从这个 tag 检出的版本在 npm 上装不到。

既然 `publish` 已经打了准确的 tag，就没有理由再补一遍。

### 不打产品级 tag

各 package 独立版本，**不存在一个能代表整个仓库的版本号**。拿某个包的版本当仓库版本（例如取 `packages/core` 的版本打成 `v1.3.0`）会产生误导性的 tag：

- `@nocobase/core` 是 `1.3.0` 时，`@nocobase/app-portal-sdk` 可能是 `2.2.0`
- tag `v1.3.0` 只反映了其中一个包
- 使用者看到 `v1.3.0` 会以为整个仓库是这个版本

所以仓库里的 tag 分两类，都不是「仓库版本号」：

```text
@nocobase/app-portal-sdk@2.2.0          package 级，changeset publish 自动打
release/2026-08-24.1                版本级，标记一次发布
```

> 如果产品侧需要一个对外版本号（例如官网、Docker 镜像标签），可以选定某个核心 package 的版本作为代表，但那属于产品发布物料，不要塞进自动发版流程——否则每次发版都要编一个仓库版本号。

### 用日期标识版本

各 package 独立版本，没有一个能代表整个仓库的版本号，日期就是版本的自然标识。已验证（`test-branch-version/experiments/batch-naming.sh`）。

|        | 发版分支                    | 版本 tag                    | merge log                     |
| ------ | --------------------------- | --------------------------- | ----------------------------- |
| 预览版 | `release-beta/2026-08-24.1` | `release-beta/2026-08-24.1` | `chore: release 2026-08-24.1` |
| 稳定版 | `release/2026-08-24.1`      | `release/2026-08-24.1`      | `chore: release 2026-08-24.1` |

tag 在合并前打在发版分支上，与分支同名。

三个实现细节：

**序号从 tag 推导，不是从分支。** 分支合并时被 `--delete-branch` 删掉，只看分支会让序号回退并与已发布版本重复：

```text
连发三批            -> .1 .2 .3
删除全部分支后再发   -> .1      <- 重复
改为从 tag 推导     -> .4      <- 正确
```

**同名期间必须用完整 refspec。** 分支和 tag 同名只持续到合并删分支为止，但在这几分钟里 `git push origin <name>` 会直接失败：

```text
$ git push origin release-beta/2026-08-24.1
error: src refspec release-beta/2026-08-24.1 matches more than one

$ git push origin refs/heads/<name>:refs/heads/<name>    # ok
$ git push origin refs/tags/<name>:refs/tags/<name>      # ok
```

合并后分支被删除，tag 独占该名字，`git show <name>` 正常可用。

**beta 与 stable 各自独立计数。** `git tag -l "release/*"` 不会匹配到 `release-beta/*`，两个前缀是分开的。跨天自动从 `.1` 重新开始。

追溯：

```bash
git tag -l 'release-beta/*'                # 所有预览版
git tag -l 'release/*'                     # 所有稳定版
git show release/2026-08-24.1              # 某批发了什么
git log --merges --grep="chore: release"   # 发布时间线
```

因为合回用的是 `--merge` 而非 `--squash`，发版 commit 保留在历史里，配合版本 tag 和 PR 记录能完整还原一次发布。

### 预发布也打 package 级 tag

早期方案用 `--no-git-tag` 关掉预发布的 package tag，担心 tag 数量爆炸。实测量很小，因为只给**版本号真的变了**的包打：

```text
5 个包，6 轮 beta（每轮只改 1-2 个包）
  第 1 轮后累计 tag: 1 个
  第 3 轮后累计 tag: 4 个
  第 6 轮后累计 tag: 8 个
```

所以预发布不再使用 `--no-git-tag`，保留 package 级 tag 作为预览版的追溯锚点。

## GitHub Release 与 npm dist-tag

需要区分三个概念：

- `@nocobase/app-portal-sdk@2.2.0-beta.1` 是 Git tag，由 `changeset publish` 自动创建。
- `2.2.0-beta.1` 是该 npm package 的 version。
- `beta` 是 npm dist-tag，决定 `pnpm add <package>@beta` 安装哪个版本。

| 来源          | Git tag               | package 版本形式 | npm dist-tag |
| ------------- | --------------------- | ---------------- | ------------ |
| `main`        | `<name>@X.Y.Z`        | 稳定 SemVer      | `latest`     |
| `develop`     | `<name>@X.Y.0-beta.N` | `*-beta.M`       | `beta`       |
| snapshot      | 无                    | `0.0.0-canary-*` | `canary`     |
| 维护分支 `vN` | `<name>@vN.Y.Z`       | 稳定 SemVer      | `vN-latest`  |

dist-tag 是 registry 上的指针，不是分支。一个包可以同时挂任意多个 dist-tag，各指向一个已发布的版本。多条渠道能共存，是因为它们指向不同时刻发布的不同版本，而不是因为存在多条分支。

## GitHub Actions 设计

实现在 `.github/workflows/` 下，全部通过 actionlint。沙盒仓库 `test-branch-version` 里有对应的实验脚本可以复现本文的验证结论。

| Workflow                   | 触发               | 作用                                              |
| -------------------------- | ------------------ | ------------------------------------------------- |
| `changeset-check.yml`      | PR to main/develop | changeset 校验（阻塞）+ 缺失提醒（非阻塞）        |
| `guard-main.yml`           | PR to main         | 拒绝 `pre.json`、`pre/`、预发布版本号进入 main    |
| `release-beta.yml`         | 手动               | develop 发 beta                                   |
| `merge-beta-to-stable.yml` | 手动               | 转正 + 合 main + develop 重新进 pre（**不发布**） |
| `release-stable.yml`       | 手动               | 发稳定版（main 或旧版本分支）                     |

**开发者不需要在本地执行任何 changeset 发版命令。** 日常只写 `pnpm changeset`，发版一律点对应 workflow 的运行按钮。

发版 workflow 都有 `dry_run` 输入（默认不勾选），勾上可以先空跑看算出的版本号再实发。共用 concurrency group `release-write`，不会并发写分支。

输入项的 description 用英文——它们直接显示在 GitHub 的运行面板上。

它们都在**临时发版分支**上完成 `version` + `publish`，再通过 PR 合回，理由见「发版必须在临时分支上进行」。

### `changeset-check.yml`

PR 触发，两层检查，严格程度不同：

- **validation**（阻塞）：校验已提交的 changeset 文件——YAML 合法、package 名存在、bump 类型合法。这类问题机器能确定判断。
- **advisory**（非阻塞，始终 exit 0）：检测可能遗漏 changeset 的 package，输出提醒。识别 `release:skip` label。bump 级别的取舍需要人判断，CI 猜不了。

### `guard-main.yml`

`main` 上永远不允许出现 `.changeset/pre.json`、`.changeset/pre/` 或预发布版本号。

这是整套流程唯一的致命失误点：它们一旦进入 `main`，之后所有从 `main` 发出的版本都会变成预发布版本，而且不容易被发现。所以单独一条阻塞规则守着。

### `release-beta.yml`

手动触发，在临时发版分支上执行 `changeset version` + `changeset publish`，再通过 PR 合回 `develop`。

dist-tag 由 `.changeset/pre.json` 决定，不能显式传 `--tag`——pre 模式下 changeset 会拒绝。

运行前校验分支处于 pre 模式——不在 pre 模式时发版会直接发出稳定版号并占掉 `latest` 该用的号段。

### `merge-beta-to-stable.yml`

把预览版转正并合进 `main`，**不发布 npm**：`pre exit` → `version` → 合进 `main` → `develop` 重新进 pre。

发布另点 `release-stable.yml`。合并涉及三条分支的状态变更，自动化保证一致性；发布时机是决策，交给人掌握。

整个流程是确定性的，逐步验证过：

```text
① 校验 develop 处于 pre 模式      读 pre.json 的 mode    确定性
② changeset pre exit             固定命令               确定性
③ changeset version              固定命令               确定性
④ 校验无预发布残留                扫 package.json        确定性
⑤ 合进 main                      可能冲突               <- 唯一变数
⑥ develop 重新 pre enter          固定命令               确定性
```

只有第 ⑤ 步有变数，而它的冲突分两种：仅 `package.json` / `CHANGELOG.md` 冲突时规则固定（版本号取 develop 的），可自动解；出现源码冲突说明两条线真的分叉了，workflow 停下交给人。

守卫链：

```text
① develop 必须处于 pre 模式          否则说明上轮没走完
② version 后版本号必须真的变了        防「静默成功」
③ 无预发布版本号残留                  否则说明 version 没生效
④ pre.json 必须已被删除              否则会污染 main
⑤ 合并冲突仅限 package.json/CHANGELOG 源码冲突就停下交给人
⑥ 推送 main 前再查一次 pre.json      最后一道闸
```

第 ② 条针对退出码看不出来的坑，见「没有 changeset 时发版会怎样」。

### `release-stable.yml`

手动触发，发稳定版。两个输入：

| 输入          | 默认   | 说明                                               |
| ------------- | ------ | -------------------------------------------------- |
| `branch`      | `main` | 从哪个分支发。给旧版本发 hotfix 时填该版本的分支名 |
| `keep_latest` | 否     | 勾上则发到 dist-tag `legacy`，不动 `latest` 指针   |

它覆盖三种场景，靠**待消费 changeset 的数量**自动分流：

```text
0 个   转正结果刚合进 main，版本号已就绪   -> 直接 publish
N 个   分支上有新 changeset                -> 先 version，再 PR 合回
```

第二种又分两类：从 `main` 发就是主线补丁，从旧版本分支发就是 hotfix。

从 `main` 发布后会自动把补丁 merge 回 `develop` 并推送——不同步的话，下一次转正会覆盖掉这个补丁。不走 PR，因为冲突的解法是确定的（见「同步冲突怎么解」）；解不了才中止并发飞书通知。

从旧版本分支发时不做这一步：那条线与主线已经分叉，是否同步由人判断。

一条防误发的校验：**从非 `main` 分支发版却没勾 `keep_latest` 时直接报错**。忘了勾会让旧版本抢走 `latest` 指针，用户 `npm install` 拿到退回的版本。

### 需要配置的 secrets

```text
NPM_TOKEN         registry 发布令牌
FEISHU_WEBHOOK    飞书通知（可选）
```

包发布到自建的 Verdaccio：`https://npm.nocobase.ai`。workflow 里由 `setup-node` 的 `registry-url` 指定，它会生成 `.npmrc`：

```text
//npm.nocobase.ai/:_authToken=${NODE_AUTH_TOKEN}
registry=https://npm.nocobase.ai/
always-auth=true
```

`NODE_AUTH_TOKEN` 是 `setup-node` 约定的环境变量名，workflow 里从 `secrets.NPM_TOKEN` 取值。因为 `registry=` 设的是全局默认，`@nocobase` scope 会跟着走，不需要额外的 scope 配置，也不需要给 30 个 package 挨个加 `publishConfig.registry`。

Git 推送用 `GITHUB_TOKEN`，它由 Actions 自动注入，不需要配置。

**这依赖于仓库当前没有分支保护。** 加上分支保护后 `GITHUB_TOKEN` 会被拒，需要换成能绕过保护的 PAT。另一个已知限制是它推送的 commit 不会触发其它 workflow（GitHub 防死循环的设计）——对本流程无影响，同步过去的内容已经在发版时 build + test 过。

首次使用需要有人在本地跑一次 `changeset pre enter beta` 并提交，之后由 workflow 接管。

### `snapshot.yml`（可选）

手动触发或定时。在临时工作区执行 snapshot version + publish，**不提交、不推送任何分支**。

## package 发布边界

### 开源 package

```json
{
  "private": false,
  "publishConfig": {
    "access": "public"
  }
}
```

### 发布到别的 registry

当前所有 package 都发到 `https://npm.nocobase.ai`，由 workflow 的 `registry-url` 统一指定，package.json 里不需要写 `registry`。

个别 package 需要发到别处时，在它自己的 `publishConfig` 里覆盖：

```json
{
  "publishConfig": {
    "registry": "https://registry.npmjs.org",
    "access": "public"
  }
}
```

`publishConfig.registry` 优先级高于 `.npmrc` 里的默认值。但要注意**认证是按 registry host 配的**——`setup-node` 只为 `registry-url` 那一个 host 写了 `_authToken`，发到别的 host 需要额外准备凭据。

顺带澄清一个容易混的点：`private: true` 表示禁止 publish，不表示「发布到私有 registry」。要发布就必须是 `private: false`，发到哪里由 `registry` 决定。

### 不发布的内部 package

```json
{
  "private": true
}
```

Changesets 默认不 version、不 tag、不 publish 这类 package。

### private 与可发布 package 不能混在同一条运行时依赖链上

这是引入 Changesets 之前必须先解决的硬阻塞，已验证。

`private: false` 的 package 通过 `dependencies` 依赖 `private: true` 的 package 时，Changesets 直接报错退出，**任何 `changeset version` 都无法执行**：

```text
Invalid tree: "@nocobase/app-host" depends on the skipped package
"@nocobase/app-server-kit", but "@nocobase/app-host" is not skipped.
Please add "@nocobase/app-host" to the "ignore" option.
```

本仓库当前就处于这个状态：`app-host` 是 `private: false`，但依赖 `private: true` 的 `app-server`。三个可选处理方式：

1. `app-host` 改为 `private: true`；
2. `app-server` 及其依赖链一并转为可发布；
3. 把 `app-host` 加入 `.changeset/config.json` 的 `ignore`。

`devDependencies` 不受这条约束，所以 `app-template-default` 依赖大量 private package 是安全的。

## NocoBase 特殊依赖规则

### Vendored server package

`@nocobase/app-template-default` 的构建会把部分 workspace server package 复制到 `dist/vendor`，并写成 `file:` 依赖。这些关系在源码 package.json 中主要表现为 devDependencies，Changesets 不会自动将其视为需要发布的运行时 dependent。

如果 vendored package 的变化需要随 Template 发版，相关 PR 应同时给 `@nocobase/app-template-default` 添加 changeset。CI 根据 vendor 清单给出非阻塞提醒。

### Portal SDK 兼容元数据

`@nocobase/app-portal-sdk` 使用 `supportedDefaultTemplateRange`，Template 和 Hub 使用 `defaultTemplateVersion`。

Portal SDK major 或 Template major 变更时，CI 必须校验 SDK 与 Template 的兼容范围。

## 构建与验证

发布前必须完成：

1. `pnpm install --frozen-lockfile`
2. 受影响 package 及其 dependents 的 `lint`、`typecheck`、`test`、`build`
3. `pnpm pack` 产物检查（发布内容是否符合 `files` 声明）

`main` 上的每次发布都应基于已通过完整 CI 的 commit。

## 失败恢复

### package 部分发布成功

直接重跑同一个 workflow。`changeset publish` 逐个查询 registry，已发布的 package 会被跳过，只补发失败的部分。

不需要手工修改版本号或删除 changeset。

### 错误版本已发布

npm 不允许覆盖已发布版本。处理方式：

1. `npm deprecate` 标记该版本；
2. 发布一个修正版本；
3. 必要时调整 dist-tag 指向。

不使用 `npm unpublish`——它会破坏已经依赖该版本的下游。

### 转正中途失败

`merge-beta-to-stable.yml` 的守卫会在推送前拦截问题，所以失败时通常没有任何东西被推出去。按失败位置处理：

| 失败在哪                 | 状态       | 怎么办                                                   |
| ------------------------ | ---------- | -------------------------------------------------------- |
| 守卫 ①～④                | 什么都没推 | 修掉根因重跑                                             |
| 合进 main 时源码冲突     | 什么都没推 | 人工解决冲突后重跑                                       |
| publish 之后、推分支之前 | npm 已发布 | 手工推 `develop` 和 `main`，或重跑（publish 幂等会跳过） |

最后一种最需要注意：npm 上已有稳定版但仓库还没更新。重跑时 `changeset publish` 会跳过已发布的包，剩下的推送步骤正常完成。

### 预览版需要废弃

如果 `develop` 上的某个版本决定不发布，执行 `changeset pre exit` + `changeset version` 清除 pre 状态，然后 `git reset` 回退版本提交，重新 `pre enter`。已发布的 `beta` 版本保留在 registry 中，调整 `beta` dist-tag 指向即可。

### develop 意外退出了 pre 模式

症状：`develop` 上没有 `pre.json`，但版本号还是 `-beta.N`，或者本该发 beta 却发出了稳定版号。

直接 `pnpm changeset pre enter beta` 重新进入即可，不需要重切分支。序号从当前版本号里的数字继续递增，不会与已发布版本冲突。

## 迁移步骤

### 阶段一：Changesets 基础设施（已完成）

- 安装 `@changesets/cli`，初始化 `.changeset/config.json`（`baseBranch` 设为 `develop`）
- 落地全部 workflow 和 `scripts/` 下的配套脚本
- 团队可以开始在 PR 中提交 changeset

> 早期版本的文档记录过一条前置阻塞：`private: false` 的 package 通过 `dependencies` 依赖 `private: true` 的 package 时，Changesets 会直接报错退出。当前仓库 30 个 package 全部是可发布的，这条阻塞已不存在。新增 private package 时需要重新检查，见「private 与可发布 package 不能混在同一条运行时依赖链上」。

### 阶段二：仓库配置

**待办**——只能人工做，做完才能真正发版：

- 配置 secrets：`NPM_TOKEN`（Verdaccio 的发布令牌）；`FEISHU_WEBHOOK` 可选，不配则通知步骤失败但不影响发版。

**已完成**：

- `develop` 已进入 pre 模式（`.changeset/pre.json`）。这是唯一需要人工执行的 changeset 命令，之后每轮转正由 `merge-beta-to-stable.yml` 自动重新进入。

**暂缓**：

- 分支保护。当前用自动注入的 `GITHUB_TOKEN` 推送，加上保护后会被拒，届时需要换成 PAT。

### 阶段三：启用 develop 预览版

1. 勾上 `dry_run` 空跑一次 `release-beta.yml`，确认算出的版本号符合预期。
2. 不勾 `dry_run` 再跑一次，完成第一轮真实的 beta 发布。

### 阶段四：走通一次完整转正

1. 勾上 `dry_run` 空跑 `merge-beta-to-stable.yml`，确认转正后的版本号。
2. 实际执行：`pre exit` → `version` → 合进 `main` → `develop` 重新进 pre。
3. 点 `release-stable.yml` 发布到 `latest`。
4. 验证冲突处理规则和守卫链是否符合预期。

这是 `main` 的**第一个稳定版**。在此之前 `main` 不发任何版本，它落后 `develop` 多少个 commit 都不要紧——首次合并是快进合并，不会冲突。

这一步跑通之后，整套流程就闭环了：`develop` 持续发 beta，需要时转正到 `main`，`main` 上出问题就地打补丁。

### 阶段五：按需补充

- `snapshot.yml`：为 PR 预览和 nightly 提供 `canary` 渠道。
- 老版本维护分支：确实需要长期维护旧版本时再开。

## 待确认事项

1. **`develop` 上的连带发布是否可接受。** 一个 package 的 patch 会带动全部下游发布预发布版本。需要确认这在实际的 NocoBase 依赖图上影响多大——本仓库的 `app-template-default` 通过 devDependencies 聚合，已经规避了最坏情况。
2. **多仓库协调。** pro-plugins 和各插件仓库如何跟随主仓库的 `develop`，需要单独设计。NocoBase 2 的做法是跨仓库直接 merge/push，本方案不再采用该形态。
3. **老版本维护策略。** 何时开维护分支、维护多久、使用什么 dist-tag 命名，需要产品侧确认。
4. **对外版本号的选取。** 各 package 独立版本，仓库不生成统一版本号。产品侧（官网、文档、Docker 镜像标签）如果需要一个对外版本，可以选定某个核心 package 的版本作为代表，具体选哪个待产品侧确认。
