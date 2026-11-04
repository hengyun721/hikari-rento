# 安装与升级

装法、升级与卸载，以及一张排障表。装完记得**新建会话**，原因见下。

## 先看这一条：装的是哪一层

> **安装目标永远是 `packages/plugin/`（或它打出来的 tgz / 发布到 npm 的包名）。**
> **仓库根目录不是组合包** —— 根的 `package.json` 是 `hikari-rento-monorepo`，没有 `dsh.bundle`，
> 指过去会被 DSH 判成 `not-a-bundle`（`<包名> declares no dsh.bundle`），装不上。
>
> 这是 1.0.0 把单包拆成 monorepo 时变的；2.x 时代根目录本身就是 bundle，所以「指仓库目录」曾经能用。

## 要求

| | |
|---|---|
| DeepSeek Harness | **≥ 0.2.2-rc.1**（本包声明的最低版本） |
| Node | ≥ 20（只影响本地构建；装了插件本身不需要 Node） |
| 权限 | 安装 bundle 会在 Host 进程里执行插件代码，需要**完全权限**或一次批准 |

## 方式一：本地目录（从源码装，最稳）

```bash
git clone https://github.com/hengyun721/hikari-rento.git
```

DSH 里 **设置 → 插件 → 安装本地 bundle**，选 **`<仓库>/packages/plugin`**（精确到这一层，
不要选仓库根，也不要选 `packages/`）。装完**重启客户端**，然后**新建会话**。

## 方式二：装 tgz（等同本地目录）

```bash
cd hikari-rento
npm run verify        # 先确认生成物与自检全绿
npm run pack:plugin   # 产出 dist/hikari-rento-<version>.tgz
```

在 DSH 里装这个 tgz，或直接用 Release 页的附件 `hikari-rento-<version>.tgz`。两者是同一份构建
（`files[]` 已经列清楚会打进包里的一切，`tar -tzf` 可以自查）。

## 方式三：从 npm（已发布）

本地包版本已到 **2.0.0**。是否已发布到 npm 以 `npm view hikari-rento version` 为准；未发布时用本地目录或 tgz。在 DSH 里 **设置 → 插件 → 安装** 填：

```
hikari-rento
```

想锁版本就填 `hikari-rento@2.0.0`。填之前可以确认一下注册表：

```bash
npm view hikari-rento version
```

> 报 `not-found` 只有一个意思：**这个版本还没推到 npm**。这时用方式一或方式二，
> 不要去改任何配置 —— 注册表里没有的东西，管理器也变不出来。

## 装完必须「新建会话」

- **正确**：安装/重载 bundle → 完全退出并重开客户端 → **新建会话**。
- **不要**：在已经建好的会话里用预设选择器切成这个插件。

原因：DSH 的 preset 注册表把「会话作用域 → preset 版本」的绑定记在 `dsh-scope` 的
一次性绑定表里（`scopeParents` 是 WeakMap，一个 key 只能绑一次），而绑定记录会随会话拆卸被清掉。
于是在旧会话上切换 preset 时，注册表会拿同一个作用域 key 再绑一次，直接命中
`dsh-scope: scope key is already bound to a parent` 这条不变式。换一个新建会话就绕开了 ——
这是注册表侧的边缘情况，与本插件无关。

## 升级

| 从 | 到 | 要做的事 |
|---|---|---|
| 1.0.x | 1.0.x | 直接装新版，重启，开新会话 |
| 旧名（`@local/dsh-character-hikari-rento`、`dsh-character-hikari-rento`） | `hikari-rento` | 先在插件页把旧的那条**移除**（它多半是 2.x 留下的死链接：指向仓库根、没有 `dsh.bundle`，看起来装着其实没装），再装 `packages/plugin/` |
| 任意 | 任意 | **不要**手写 `$DSH_HOME/profiles/<profile>/package.json`，也不要在 profile 目录里跑 pnpm —— 那些步骤由插件管理器负责 |

## 卸载

**设置 → 插件** 里移除本 bundle，重启客户端。
若之前把它设成了默认 preset，移除后默认 preset 会回到 DSH 自己的 `standard`。

`references/` 与 `character.json` 都是插件目录里的普通文件，移除 bundle 时一并带走，不会残留。

## 排障

| 症状 | 大概率原因 | 怎么做 |
|---|---|---|
| 安装被拒：`not-a-bundle` / `declares no dsh.bundle` | 指到了**仓库根**（或 `packages/`） | 重选，精确到 `packages/plugin/` |
| 安装被拒：`not-found` | 该版本还没发布到 npm | 改用本地目录或 tgz |
| 安装成功但预设列表里没有「角色：恋兔光」 | 没重启 / 装到了别的 profile / 旧会话 | 完全退出客户端再开；确认当前 profile；**新建会话** |
| 插件页能看到一条装了却启不了的旧条目 | 2.x 时代的链接依赖（`@local/...`） | 移除它，再按方式一装 |
| 切预设时报 `scope key is already bound to a parent` | 在已存在的会话里切了 preset | 新建一个会话 |
| 她答得又长又像解说 | `detail` 太小 / 模型把「示例台词」当模板 | 调到 `full`；`fewShotEnabled: false` 试试 |
| 她会认领没经历过的剧情 | 参考档没被读到 | 确认 `detail: full`，且 `references/` 四份都在 |
| 提示词里出现「档案」「设定」这类出戏词 | 模型的自我解释习惯 | 属于概率性表现，`core` 里已有禁止项；可在 issue 里贴一段复现 |
| 干活时也用她的口吻报错 | `roleplay` 段没进提示词 | 需要 `detail: full` |

更多细节见 [配置](configuration.md) 与 [测试](testing.md)。
