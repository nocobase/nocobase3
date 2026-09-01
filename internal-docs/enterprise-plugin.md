---
title: Enterprise Plugin
description: 闭源商业插件的仓库划分、开发联调、发版与分发方案
---

# 闭源商业插件方案

> 状态：提案。本文讨论 `@nocobase/app-plugin-ai-knowledge-base` 这类要闭源商业化的插件该怎么开发、构建、发版、分发。方案尚未落地。

## TLDR

**开一个独立的私有仓库放商业插件，单向依赖开源仓库，各自发各自的版。**

```
nocobase3（开源）                    nocobase3-pro（私有）
├── @nocobase/app-server             ├── vendor/oss/  ← submodule，指向开源仓库某个 commit
├── @nocobase/app-client        ◄────┤
├── @nocobase/app-plugin-ai-employee ├── @nocobase/app-plugin-ai-knowledge-base
└── 完全不知道 pro 的存在            ├── 其他商业插件
                                     └── 自己的 changeset / CI / 发版
```

箭头只有一个方向：pro 看得见开源仓库，开源仓库不知道 pro 存在，也不需要知道。

开源仓库的代码通过 submodule 进 pro 仓库的 workspace，这样本地改 core 能立刻在插件里验证。为什么不是从 npm 装，见「本地开发怎么联调」。

## nocobase v2 版本做法的缺点

v2 是这样的：私有仓库 `pro-plugins` 里放一堆商业插件，大仓库发版时把它们拉进来一起构建，统一版本号发布。

这套做法有两个问题。

**第一，它存在的理由已经没了。** 当初必须拉回大仓库构建，唯一的硬约束是所有包共用一个版本号。v3 用 changeset 按包独立发版，这个约束不在了，商业插件也就没必要再回开源仓库构建。

**第二，lockfile 会反复抖动。** v2 用 gitignore 忽略 `pro-plugins` 目录，于是有人本地有、有人没有，`yarn install` 出来的 lockfile 两种形态来回覆盖。

这里要说清根因，不然新方案容易重蹈覆辙：问题不在 gitignore 用得对不对，而在**一份 lockfile 被要求描述两种依赖图**。gitignore 只能让 git 看不见那个目录，拦不住 pnpm 看见。

分仓之后开源仓库的 workspace 里根本不会出现 pro 目录，lockfile 只有一种形态。这个问题从结构上消失，不用靠纪律维持。

## 私有仓库建议依然以 monorepo 形式组织

商业插件之间有依赖，比如 `app-plugin-ai-knowledge-base` 现在就依赖 `app-plugin-ai-employee`。拆成一堆单包仓库，跨仓库依赖的麻烦会乘以插件数量，本地联调、CI、发版都得重做一遍。

而且「monorepo 意味着统一版本号」这个前提在 v3 已经不成立，所以保持 monorepo 的成本比 v2 时低得多。

至于客户想看源码，发 npm 的时候把 `src` 带上就行，不用为此拆仓库。

## 本地开发怎么联调

分仓真正的代价就这一条：pro 仓库开发的时候，开源那部分代码从哪来？

有四个选项：

| 方案            | 做法                                                | pro 仓库 lockfile          | 改 core 后多久能验证 | 基于哪个 core           |
| --------------- | --------------------------------------------------- | -------------------------- | -------------------- | ----------------------- |
| A 依赖发布版    | pro 仓库依赖 `^1.0.0-beta.x`，从 npm.nocobase.ai 拉 | 可安全提交                 | 等一次 npm 发布      | 版本号                  |
| **B submodule** | 开源仓库作为 submodule 拉进来，两边一起进 workspace | **可安全提交**             | **立刻**             | **commit SHA 显式记录** |
| C 手工软链      | 脚本在 `node_modules/@nocobase/` 下建软链           | 不变                       | 立刻                 | 隐式，只有本地知道      |
| D link 协议     | pnpm 的 `overrides` + `link:` 指向本地目录          | **含仓库外路径，不能提交** | 立刻                 | 隐式，只有本地知道      |

### 推荐 B - submodule 的方式

有三个理由，都在沙盒里实际跑过。

**第一，pro 仓库的 lockfile 可以安全提交。** submodule 里的包通过 `workspace:` 进入依赖图，lockfile 记的是仓库内相对路径：

```yaml
'@nocobase/app-server':
  version: link:../vendor/oss/packages/app/app-server
```

这个路径对所有人都一样。对比 D，它写进 lockfile 的是 `link:../../nocobase3/packages/app/app-server`——指向仓库**外**，只对写它的那台机器成立。

**第二，升级 core 不会让 lockfile 抖动。** 我把 submodule 指针从一个 commit 移到另一个，重新跑 `pnpm install`，lockfile 一个字节都没变——它记的是路径，跟 core 是哪个版本无关。

这正好是 v2 那个痛点的反面：v2 抖是因为一份 lockfile 要描述两种依赖图，B 不抖是因为所有人的依赖图完全一致。

**第三，本地体验跟现在的单仓库一样。** 全源码、能跳转、能断点，改完 core 立刻在 pro 插件里生效。

B 的代价只有一条：升级 core 要显式移一次 submodule 指针。不过这件事其实是优点，下面单独说。

### 为什么不选 A / C / D

**A（依赖发布版）** 没有错，只是慢。改一次 core 要等一轮 beta 发布才能在 pro 里验证。如果 pro 插件很少动 core，A 完全够用，也不需要引入 submodule。

**C（手工软链）** 绕过了包管理器。软链看起来能跑，但 typecheck 和构建的解析路径未必正确，出问题时很难判断是代码错了还是链错了。

**D（link 协议）** 是 pnpm 原生的，解析没问题，但它把一个**不能提交的东西写进了受版本控制的文件**。一旦有人忘了 unlink 就提交，pro 仓库的 lockfile 就带着一个只在他机器上存在的路径进了主干，别人 `pnpm install` 直接失败。

靠纪律维持正确性的方案，迟早会有人忘。D 临时试一下可以，别当常规工作流。

## 在 B 里改了 core 怎么同步

先要理解一件事：submodule 是一个**独立的 git 仓库**，你在 `vendor/oss/` 里改的东西不属于 pro 仓库。所以分两种情况。

### 只在本地验证，不落回开源仓库

直接改 `vendor/oss/` 里的代码，pro 插件立刻就能用——它们在同一个 workspace 里，走的是软链。改完 typecheck、跑测试、打断点，跟现在的单仓库体验没区别。

这时候改动只在你本地的 submodule 工作区里，影响不到别人。

### 要落回开源仓库

```bash
# 1. 在 submodule 里提交，推到开源仓库，走正常 PR 流程
cd vendor/oss
git checkout -b fix/something
git commit -am "fix: ..."
git push origin fix/something
# → 在 nocobase3 开源仓库开 PR，评审合并

# 2. PR 合并后，把 submodule 指针移到新 commit
cd vendor/oss
git fetch && git checkout develop && git pull

# 3. 回到 pro 仓库，提交这次指针移动
cd ../..
git add vendor/oss
git commit -m "chore: bump oss to <sha>"
```

第 3 步提交的**不是代码，是一个 commit SHA**。pro 仓库的 diff 里只有一行：

```diff
-Subproject commit 574f4f24012924aeb948b6f0dda74cdb16d2ca37
+Subproject commit 33dda87384bb395f0af770e4ffdb4006eea9caa1
```

### 为什么这一步是优点

因为它把「pro 仓库现在基于哪个 core」变成了写在仓库里的记录：谁升的、什么时候升的、升到哪个 commit，git log 里清清楚楚。CI 挂了直接 `git revert` 那一个 commit，就精确回到上一个 core 版本。也不会出现「我这儿能跑你那儿不行」，因为大家的指针由仓库统一。

C 和 D 就没这个好处。你 link 到哪个 core、哪个分支、有没有未提交的改动，别人不知道，CI 也不知道。

### 日常需要知道的两条命令

克隆 pro 仓库时要连 submodule 一起拉：

```bash
git clone --recurse-submodules <pro-repo>
```

已经克隆过、或者别人移动了指针后拉到新提交时，把 submodule 同步到仓库记录的那个 commit：

```bash
git submodule update --init --recursive
```

忘了跑第二条，`vendor/oss` 会停在旧 commit，表现出来就是「代码明明合了但我本地没有」。建议在 pro 仓库的 `postinstall` 里自动跑一次，省得每次都要想着。

## 两个容易忽略的坑

### catalog 必须完整镜像过来

`catalog:` 是 **workspace 级**的配置，pnpm 只认当前 workspace 根目录那份 `pnpm-workspace.yaml`。

这一点在 B 里马上就会遇到：submodule 里的开源包大量用 `catalog:`，但它们进的是 **pro 仓库**的 workspace，pnpm 就去 pro 仓库的 `pnpm-workspace.yaml` 找条目。缺一个直接报错：

```
ERR_PNPM_CATALOG_ENTRY_NOT_FOUND_FOR_SPEC
No catalog entry 'hono' was found for catalog 'default'.
```

所以 **pro 仓库的 catalog 必须完整覆盖开源仓库用到的每一个条目**。

好在这是硬失败，`pnpm install` 当场就报，不会带病跑起来。麻烦的是得持续同步——开源仓库加一个 catalog 条目，pro 仓库不跟就装不上。

写个脚本从 `vendor/oss/pnpm-workspace.yaml` 把 catalog 段同步到 pro 仓库根目录，CI 里检查两边一致就行。开源仓库就在 submodule 里，脚本读的是本地文件，不用联网。

另外这也顺带解决了版本漂移：两边 catalog 强制一致，就不会出现开源仓库升了 React 而 pro 没跟、最后用户应用里有两份 React 的情况。

### 上下游联动要主动触发

分仓最大的风险是破坏性改动发现得晚——开源侧改了 API，pro 侧要到下次手动升级才炸。

在 `release-beta.yml` 末尾加一步 `repository_dispatch`，触发 pro 仓库跑一次「升到最新 beta + build + test」，挂了发飞书。`feishu-notify.sh` 已经有了，接上去很快。

## 给个别客户开源码

v2 的做法是再开一个私有 GitHub 仓库，单独给客户权限。这套可以不要了。

npm.nocobase.ai 是自建的，按包配 ACL 就够了：发布时 `files` 里带上 `src`，给客户的 token 只授权他买的那几个包。客户 `pnpm install` 下来就有源码，不用额外开仓库、不用额外维护一套权限，也看不到别的商业插件。

如果个别大客户要得更彻底，可以用 `git subtree split` 把单个插件的历史切到独立私有仓库。不过这是例外，别当默认路径。

## 前置依赖：peer dependencies

分仓的前提是插件必须把运行时依赖声明为 `peerDependencies`。这件事已经完成（#95）。

简单说，`@nocobase/app-server`、`@nocobase/db` 这类包持有「进程内必须唯一」的状态——服务容器按 token 对象身份索引、React context、全局注册表。写在 `dependencies` 里，包管理器就可以给插件装第二份，运行时的表现是「服务明明注册了却报未注册」，很难查。

在 monorepo 里 pnpm 把所有引用链到同一个目录，这个问题压根不会出现。**但插件一旦从私有源发布出去，它就会出现。** 详见 AGENTS.md 的「Depending on Identity-Sensitive Packages」。
