# hikari-rento

[中文](README.md) | [English](README.en.md)

[![npm: hikari-rento](https://img.shields.io/npm/v/hikari-rento?style=flat-square&logo=npm&label=plugin)](https://www.npmjs.com/package/hikari-rento)
[![npm: hikari-rento-skill](https://img.shields.io/npm/v/hikari-rento-skill?style=flat-square&logo=npm&label=skill)](https://www.npmjs.com/package/hikari-rento-skill)
[![Stars](https://img.shields.io/github/stars/hengyun721/hikari-rento?style=flat-square&logo=github&label=Stars)](https://github.com/hengyun721/hikari-rento/stargazers)
[![License](https://img.shields.io/github/license/hengyun721/hikari-rento?style=flat-square&label=%E8%AE%B8%E5%8F%AF%E8%AF%81)](LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/hengyun721/hikari-rento/ci.yml?style=flat-square&label=CI)](https://github.com/hengyun721/hikari-rento/actions)

**把《这里是，终末停滞委员会。》的恋兔光做成人设，两个发行形态：DeepSeek Harness 插件，和一份可移植的 skill。**

「完美无缺的最强美少女」、尾巴上的「～」「♪」「啦」「哦」「呢」，以及盔甲底下那个
怕烫怕辣怕鬼、把真心藏到最后、只会说「我是无敌的」来让别人安心的笨拙少女。

两者**并行发行、同源生成**：`character.json` 是唯一真源，插件包与技能包各自版本号、
各自 tag、各自 Release，谁也不是谁的附属产物。

> ⚠️ **剧透提示**：`references/`、`人设.md`、`证据与归属说明.md` 以及两个包里的
> `references/` 副本都有原作六卷的剧情细节。**README 和 `docs/` 不含剧透**。

## 两种形态

| | [`hikari-rento`](packages/plugin) | [`hikari-rento-skill`](packages/skill) |
|---|---|---|
| 是什么 | DeepSeek Harness **bundle 插件** | 可移植 **skill** 包 |
| 怎么加载 | 声明 agent preset，工作层保持中立，**只把最终聊天回答**交给文风层 | 宿主按需加载，**借**一副嗓子 |
| 工具 | 与官方 `standard` preset 逐行一致（对齐 DSH 0.2.2-rc.1） | 用宿主自己的工具 |
| 装法 | 插件管理器（本地目录 / tgz / npm） | 拷目录 / 解开 `.tgz` |
| tag | `plugin-v*` | `skill-v*` |

## 安装

### 插件（DSH）

> **安装目标是 [`packages/plugin/`](packages/plugin) —— 不是仓库根。**
> 根的 `package.json` 没有 `dsh.bundle`，指过去会被判 `not-a-bundle`（1.0.0 拆分后如此；
> 2.x 时代根目录才是 bundle）。

**本地目录（最稳）**：**设置 → 插件 → 安装本地 bundle** → 选 `<仓库>/packages/plugin`。

**tgz**：`npm run pack:plugin` 产出 `dist/hikari-rento-<version>.tgz`，或直接下 Release 附件，装它。

**npm**：插件在 registry 上是 [`hikari-rento`](https://www.npmjs.com/package/hikari-rento)。
是否已发布到 2.1.0 以 `npm view hikari-rento version` 为准；未发布时请用本地目录或 tgz。

装完**重启客户端**，然后**新建会话**。逐条排障见 [安装文档](docs/install.md)。

### Skill（任意 agent）

把 [`packages/skill/`](packages/skill) 整个目录拷进宿主的 skills 目录，或者解开 Release 里的
`hikari-rento-skill-<version>.tgz`：

```bash
tar -xzf hikari-rento-skill-1.1.0.tgz -C ~/.claude/skills/
```

然后新开一个会话，说「恋兔光模式」。

### Skill 在 Claude Code / Codex 里的建议

skill 是**提示词级**发行，不会自动保护代码/表格或做事实校验；它能提供人设、知识边界和“交付前自检”流程。

- **Claude Code**：放到 `~/.claude/skills/hikari-rento/`（用户级）或 `.claude/skills/hikari-rento/`（项目级），新会话说「恋兔光模式」。
- **Codex**：放到当前版本的 skill/agent 目录；如果没有自动加载，在项目 `AGENTS.md` 写明「遇到恋兔光模式先读 `.skills/hikari-rento/SKILL.md`」。
- **其他 agent**：把目录放进宿主 skills 目录，或用一段短 wrapper 指向 `SKILL.md`，不要把全文反复粘进每次对话。
- **长任务**：先声明「工作过程保持正常工程语气，最终回答再转换口吻」；技术结论先准确，代码/表格/路径不要改。
- **需要运行时审查**：用 `hikari-rento` 插件 2.1.0，或接 finalizer/MCP；不要指望 skill 自己保证。

详细说明见 [`packages/skill/README.md`](packages/skill/README.md)。

### 装完请「新建会话」

- **正确**：安装/重载 bundle 后 → 完全退出并重开客户端 → **新建会话**。
- **不要**：在已经建好的会话里用预设选择器切成这个插件。

DSH 的 preset 注册表把「会话作用域 → preset 版本」记在一次性绑定表里，旧会话重绑会撞上
`dsh-scope: scope key is already bound to a parent`。新建一个会话就绕开了。

## 插件会做什么

| 能力 | 说明 |
|---|---|
| **工作层保持中立** | 普通任务按工具、文件、测试结果和事实执行；不把口癖、情绪、关系表塞进工作过程 |
| **只改最终聊天回答** | `llm/stream` 只处理没有工具调用的纯文本回答；文件内容、代码、命令和工具参数不经过文风层 |
| **交付前准确性审查** | 改写前保护代码、表格、路径、URL、数字和文件名；改写后逐段还原、校验数字/结构和只读内容，再做一次事实校验；失败就回退对应原文 |
| **分段改写、失败隔离** | 长回答按约 1500 字分段，表格/代码/列表不拆；某段失败只回退该段，不会整条全灭 |
| **受保护内容可读不可改** | 表格和代码以只读上下文提供给编辑模型，模型能理解但输出必须使用占位符；复制到正文会被拒绝 |
| **技术回答也有人设锚点** | 技术场景 few-shot、开头/中段/结尾锚点、长回答轻量收尾；不是每句硬塞“哦” |
| **截断保护** | 原始 `finish` 不是 `stop` 时不改写真答，避免把截断内容润色成完整回答 |
| **可观测** | `DSH_HIKARI_DEBUG=1` 可记录钩子、分段、占位符、还原/校验/事实检查的失败原因，不打印正文 |
| **文风编辑不是开关** | 最终回答会自动尝试转换成她的口吻；没有「要不要人设」的用户配置 |
| **恋兔光问题才查档案** | 只有明确问角色、世界观、经历或关系时才读 `references/`；普通工作不打开档案 |
| **知道什么、不知道什么** | 每条设定都带〔我〕亲历／〔听〕听说／〔不知〕／〔忘〕标签，越界就说不记得 |
| **不认领别人的战绩** | 别处来的经历、别人打过的仗 —— 问到会纠正，而不是顺着演 |
| **出场就往回收** | 默认一到两句，不写动作、不写括号旁白、不把招牌台词一整套念完 |

## 配置

装完不需要任何配置 —— `cordis.patch.yml` 已把**新建会话的默认 preset** 设成「角色：恋兔光」。
不想让它当默认：删掉补丁末尾 `- id: agent-preset-registry` 那一段再重装。

想调的人改 preset 里挂载插件的那一行：

```yaml
- id: character-hikari-rento
  name: 'hikari-rento'
  config:
    detail: full              # minimal | standard | full
    fewShotEnabled: true      # 文风编辑是否附示例台词
    sectionName: character:work-policy
    sectionOrder: 0
    overrideIdentity: true
    identityText: You are an AI assistant.
    includeRuntimeContext: true
```

| 字段 | 默认 | 说明 |
|---|---|---|
| `detail` | `standard` | **工作层**的档案路由深度：`minimal` 只给核心策略，`standard` 加档案路由，`full` 再加档案纪律。不再控制人设全文 |
| `fewShotEnabled` | `true` | 文风编辑是否附示例台词；关掉只影响最终回答的像不像，不影响工作准确性 |
| `sectionName` | `character:work-policy` | 工作层段落名；不再遮蔽部署级人设，全局挂载也不需要改名 |
| `sectionOrder` | `0` | 工作层段落排序值 |
| `overrideIdentity` | `true` | 遮蔽 DSH 自带的 `harness:identity`；一些第三方中转会对固定模板句做逐字风控。全局挂载时同一作用域不能重名，必须设 `false` |
| `identityText` | `You are an AI assistant.` | 遮蔽后的身份段文案；默认中性，最终回答由文风层处理 |
| `includeRuntimeContext` | `true` | 关掉会连沙箱策略、审批策略一起移除（全有全无） |

### 工作层详细度

`detail` 现在只影响**工作层**：工作过程保持中立，只有恋兔光/世界观问题才按档案路由查资料。**最终聊天回答（包括普通任务和技术问答）仍由文风层转换成她的口吻**，不随 `detail` 变化。

| `detail` | 工作层内容 |
|---|---|
| `minimal` | 中立工程策略；不附档案路由 |
| `standard` | 中立工程策略 + `references/index.md` 路由 |
| `full` | 再追加档案纪律（标签优先、不在场不认领、查不到就说不知道） |

完整人设仍保存在 `character.json`，文风编辑使用其中的口癖、性格、价值观、对话纪律和示例台词；关系表、世界设定只在档案模式使用。

### 长回答与调试

- 最终回答按原 text block 处理，不把多个块合成一个；block 内按 Markdown 段落/句子切分，表格/列表/引用/代码块不拆，某段失败只回退该段。
- 原始 `finish` 不是 `stop` 时直接放行，不润色被截断的内容。
- 不再保护所有裸数字，只保护代码、URL、路径、文件名、日期/时间、带单位量、图表条例编号等；数字仍由校验兜底。
- 排查改写为什么没生效时，在启动 DSH 的环境里设 `DSH_HIKARI_DEBUG=1`。日志会记录钩子是否触发、原文长度、占位符数、还原/校验/事实检查的失败原因；不会打印正文。
- 事实校验调用给了 256 token；如果模型仍返回空或非 `PASS`，该段会回退原文。

### 哪些内容会被保护

- **隐藏并逐字还原**：代码块、行内代码、Markdown 链接/图片、URL、邮箱、IP、Windows/UNC/Unix 路径、Markdown 表格、HTML `<table>`、文件名、LaTeX 公式、图表条例编号、带单位量、日期/时间、常见密钥格式。
- **只读上下文**：表格最多展开 1800 字、代码最多预览 500 字，编辑模型能知道“这里是什么”，但不能改；只读片段被复制到正文会被拒绝。
- **只校验、不隐藏**：裸数字（数字集合必须一致）、代码围栏数量、长度比例。
- **目前不保护**：普通标题/列表/引用的文字内容（结构上不拆，但措辞仍可能被改）、人名/关系/语义断言（靠事实校验，不可靠）、带空格的完整路径、未加反引号的命令、非标准密钥格式。
- **位置**：占位符内容保证不变，但不保证位置不变；编辑模型如果把占位符挪走，内容会跟着挪。

## 档案调用（`references/`）

`full` 的工作层会附一段档案路由：普通工作不打开档案，只有这四类问题才去翻。

| 问题类型 | 读哪份 |
|---|---|
| 台词归属（哪句不是她说的）、哪些不是她的经历 | `references/guardrails.md` |
| 世界常识：组织、地理、力量体系、RANK、Stage、弹痕／斩击／片羽 | `references/world-commons.md` |
| 队友与熟人的能力、能力边界、到达点 | `references/team-abilities.md` |
| 上面没写到的细节 | `references/persona.md`（先扫 `references/index.md` 定位） |

纪律写在段落里：一次只读一份、读到的只当依据不许复述、档案里没有的就按「不知道」办。
参考档目录的**绝对路径由 `index.js` 在加载时用 `import.meta.url` 算出来**，装到哪都成立。

## 目录结构

```
hikari-rento/
├── character.json          # 角色定义：唯一真源
├── references/             # 四份参考档（源头，⚠️ 含剧透）
├── packages/
│   ├── plugin/             # npm: hikari-rento —— DSH 插件
│   │   ├── index.js        # 生成物：插件本体
│   │   ├── cordis.patch.yml
│   │   ├── character.json  # 生成的副本
│   │   └── references/     # 生成的副本
│   └── skill/              # npm: hikari-rento-skill —— 技能包
│       ├── SKILL.md        # 生成物：frontmatter + 人设
│       └── references/     # 生成的副本
├── scripts/                # build / self-check / package-plugin / package-skill
├── docs/                   # 安装、配置、架构、测试、发行、skill
├── 人设.md                 # character.json 的可读版（⚠️ 含剧透）
├── 证据与归属说明.md        # 逐卷证据（⚠️ 含剧透）
└── .github/workflows/ci.yml
```

改人设**只改 `character.json`**（要改设定细节则同时改 `references/`），再 `npm run build`：
插件包与技能包一起重生成，`npm run check` 逐个比对。

## 文档

| 文档 | 内容 |
|---|---|
| [docs/install.md](docs/install.md) | 两种形态的装法、升级、卸载、排障表 |
| [docs/skill.md](docs/skill.md) | Skill 版与插件的差别、打包、安装 |
| [docs/configuration.md](docs/configuration.md) | 全部配置项、详细度、`sectionName` 冲突 |
| [docs/architecture.md](docs/architecture.md) | 插件怎么工作、生成链、文件职责 |
| [docs/testing.md](docs/testing.md) | 测试覆盖、怎么加断言、人工验收 |
| [docs/publishing.md](docs/publishing.md) | 发 npm、两套 tag、发版检查单 |

## 开发与测试

```bash
npm run build      # character.json → 两个包的全部产物
npm run check      # 产物是否与 character.json 同步
npm test           # 零依赖结构自检 + 文风层测试（CI 同款）
npm run pack       # 打包 plugin 与 skill 到 dist/
npm run privacy    # 扫本机路径、密钥、邮箱
npm run verify     # check + test + privacy
```

CI（`.github/workflows/ci.yml`）在 Node 20 / 22 上跑 `npm run verify`，再把两个包各打一份
artifact —— 不需要装 DSH，也不需要任何依赖。

## 发版

两套 tag，互不牵连：

```bash
# 插件
npm version patch -w packages/plugin
git tag plugin-v$(node -p "require('./packages/plugin/package.json').version")

# 技能
npm version patch -w packages/skill
git tag skill-v$(node -p "require('./packages/skill/package.json').version")
```

细节与检查单见 [docs/publishing.md](docs/publishing.md)。

## 已知限制

- **她仍然会跑偏。** 档案调用是**提示词级**的纪律，不是宿主的 skill 机制。
- **人设是压缩的。** 六卷的细节压成十来段提示词，边界靠标签兜底。
- **只在包层面验证过。** 产物一致性与补丁结构有逐项断言；DSH 里的实际安装生效依赖插件管理器版本。
- **同人作品。** 素材归属见 [NOTICE.md](NOTICE.md)。

## 素材与授权

- **代码**：MIT，见 [LICENSE](LICENSE)。
- **角色素材**：《这里是，终末停滞委员会。》的角色、世界观与台词归原作者与出版方所有。
  本仓库是**未获授权的同人企划**，不含原作正文，只放二次创作的摘要与整理，非商业用途。
- **翻译来源**：中文版为民间汉化，**译者：明日风等**（详见 [NOTICE.md](NOTICE.md)）。
- **每次校对都留痕**：哪些台词容易被误挂到她身上，记在 [证据与归属说明.md](证据与归属说明.md)。

## 贡献

欢迎提 issue 与 PR。改人设前请先读 [CONTRIBUTING.md](CONTRIBUTING.md)：
这个项目**宁可答「不知道」，也不许编** —— 加设定要能指出卷数与场景。