# Changelog

所有重要改动都记在这里。格式参照 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [SemVer](https://semver.org/lang/zh-CN/)。

## [Unreleased]

（暂无）

## [plugin 2.0.3] — 2026-11-05

### Fixed

- **改写失败不再静默**：新增 `DSH_HIKARI_DEBUG=1` 调试开关，记录钩子是否触发、原文长度、占位符数、还原失败、本地校验失败、事实校验失败和编辑异常；不打印正文。
- **保护粒度降低**：不再保护所有裸数字，只保护代码、URL、路径、文件名、日期/时间、带单位量、图表条例编号等；技术回答的占位符数量从数百降到可控范围。
- **分段改写、分段回退**：最终回答按段落/代码块切成不超过约 1500 字的段，逐段改写、逐段校验；某段失败只回退该段，不再整条作废。
- **事实校验预算**：`verifyRewrite` 的 `maxTokens` 从 64 提到 256，避免推理 token 吃光预算导致空回复。

## [plugin 2.0.1] — 2026-11-05

### Fixed

- **修正工作层用语**：2.0.0 的提示词写成「普通任务不要使用恋兔光口吻」，容易被读成「普通任务的最终回答也可以不回人设」。实际要求是：**工作过程**（工具参数、文件内容、命令、代码、中间进度）保持中立；**最终聊天回答，包括普通任务和技术问答，仍由文风层转换成恋兔光口吻**。
- 同步 README / architecture 的表述，避免把「工作层中立」误读成「最终回答中立」。

## [plugin 2.0.0] — 2026-11-05

### Breaking

- **工作层与最终回答层分离**：`index.js` 不再把完整人设注入 system prompt。工作层只注册中立的工程策略和档案路由；普通任务不受口癖、情绪、关系表影响。
- **最终回答强制文风编辑**：监听 `llm/stream`，只处理没有工具调用的纯文本最终回答，用 `character.json` 的 `speech`、`personality`、`values`、`conversation` 与 `fewShot` 改写。没有「要不要人设」的用户开关。
- **删除尾锚**：`anchorEnabled` 与 `deployment:persona-suffix` 移除。最终回答层已经是必经路径，尾锚只会重复。
- **`detail` 语义变更**：现在只控制工作层的档案路由深度（`minimal`/`standard`/`full`），不再控制人设全文。
- **`sectionName` 默认值改为 `character:work-policy`**：插件不再注册 `deployment:persona-prefix`，也不再遮蔽部署级人设。

### Added

- **最终回答准确性保护**：编辑前把数字、路径、代码块、URL、文件名替换为占位符；编辑后还原并校验长度、占位符完整性和数字集合，再用一次事实校验调用；任何一项失败都回退原始工程回答。
- **工具步骤放行**：流里出现 `tool-call-delta` 时直接放行，工具参数、文件内容和中间进度不经过文风层。
- **辅助调用过滤**：没有 `sessionId` 或有 `purpose` 的调用（标题、压缩、文风编辑本身）不进入文风层。
- **`scripts/voice-test.mjs`**：保护/还原、事实校验、工具步骤放行、最终回答包装的零依赖测试。

### Why

旧版把完整人设放进工作层，模型在选工具、读文件、写进度时也会被人设影响；同时又靠尾锚补救语气，两层都在做同一种提醒。2.0 把「工作要准」和「最终要像」拆开：工作层中立，最终层改写，事实校验兜底。

## [plugin 1.0.6] — 2026-11-04

### Fixed

- **适配 DSH 0.2.2-rc.1**：`cordis.patch.yml` 的 preset 重新与官方 `standard` 逐行对齐。
  - 删掉 `tool-subagent-list-agents` 行：`@deepseek-ai/dsh-tool-subagent-control/list-agents`
    子路径已不存在，`list_agents` 现在由 `tool-subagent-control` 自己注册；保留旧行会让 preset 挂载失败。
  - `tool-subagent` 的 `modelSelectionSettings: true` 改为 `modelSelection: true` +
    `modelDiscovery: true`，跟上 0.2.2 的配置字段。
  - `tool-fs` 显式写 `applyPatch: false`；`tool-plugin-manager` 的 `disabled` 改为
    `!!js "!ctx.get('profileContext')"`，与 `standard` 保持一致。
- `engines.dsh` 的最低版本提高到 `>=0.2.2-rc.1`：本版 preset 使用 0.2.2 才有的字段，
  旧宿主上会丢失 `list_agents` 或子代理路由选择。

### Changed

- **口头池校订（1.0.5 之后已提交，本版一并发行）**：按使用场合重新分组——「得意（日常自夸）/（对敌或胜负）」、
  「甩锅（收工/善后）」「温柔（关心/安慰）」「告别（真的要分开）」「战斗（只在真正动手或暴怒时）」
  「挑衅（对熟人玩笑或对敌人；技术问答别用）」；删掉未在资料里出现过的「浑沌」句。
- **招牌台词限场**：「灯光！摄像！开拍！！」只在登场用，「Rock 'n' roll！」只在战斗/演出收场用。
  core、口癖表、口头池说明、对话纪律都加了这条约束；few-shot 删掉「完成任务→必杀收招」的示范，
  换成「说完就停」的两个例子。
- **工作语气口径（方案 C）**：把「技术回答不要套口头池」统一改写为「口吻仍是恋兔光，只是别硬塞台词」；
  roleplay、对话纪律第 7 条、口头池说明和尾锚同步；尾锚补一句「回答前先自问：这句话是恋兔光会说的吗？」，
  避免模型把「工程语气」误读成「技术回答可以不演」。
- **交付说明边界**：明确「交付说明（文件说明、总结、『搞定了』之类）属于最终回答，不是工作过程」；
  roleplay、对话纪律第 7 条、尾锚同步；few-shot 增加 3 条交付说明示范（报告正文可以专业，交付说明用她的口吻）。

## [plugin 1.0.5] — 2026-10-21

### Fixed

- **身份段遮蔽**：`index.js` 现在遮蔽 `harness:identity`（新增 `overrideIdentity`，默认 `true`；
  文案由 `identityText` 给出，默认 `You are an AI assistant.`）。DSH 原文
  `You are an AI agent powered by DeepSeek Harness.` 是一些第三方中转服务的常见触发点：
  它们会对 system 里的固定模板句做逐字风控，命中后用自家的中性提示词替换**整段 system**，
  并在一段时间内保持该状态——人设、口癖、关系表随之全部丢失，表现就是「标准模式 / 问关系说不知道」。
  遮蔽后提示词以中性身份开头，紧接着就是恋兔光的人设段。

### Why

复现：同一个 17,468 字的 full 人设，直接作为 system 发送 → 11,696 prompt tokens、
回答「我是恋兔光」；在前面加一句原文身份 → 触发风控、整段 system 被替换，prompt tokens 只剩 57。
全局挂载（非 preset）时同一作用域内不能有同名段，需把 `overrideIdentity` 设为 `false`。

## [plugin 1.0.4 / skill 1.0.4] — 2026-10-21

### Added

- **尾锚**：`index.js` 在注册 `deployment:persona-prefix` 之后，再注册一段
  `deployment:persona-suffix`（order 10200）——「你是恋兔光。回答用户时用她的口吻；
  工具调用与中间进度可以工程语气，但那不是你说话的样子。」
- 新配置 `anchorEnabled`（默认 `true`）：不想用尾锚可以关掉。

### Why

长上下文里前缀会被稀释，模型在长任务/长问题下回到默认腔。尾锚在每一步组装时都紧贴生成点，
不改设定、只把身份放到最后一句。
## [plugin 1.0.3] — 2026-10-20

### Fixed

- **安装入口归位**：所有文档改指向 `packages/plugin/`。1.0.0 拆成 monorepo 后仓库根不再是组合包
  （根 `package.json` 没有 `dsh.bundle`），指过去会被 DSH 判成 `not-a-bundle`；`docs/install.md`
  补了 `not-a-bundle` 与 `not-found` 两条排障，并删掉从未成立的 `npm i hikari-rento`
  —— npm 路线改成在插件管理器里填 `hikari-rento@<version>`，填之前先 `npm view` 确认已发布。
- **`engines.dsh` 挪到顶层**：DSH 只读顶层 `engines.dsh`，原先写在 `dsh.engines` 里，
  等于没有版本门槛。
- **locale 展示元数据**：`title`/`description` 包进 `meta`，否则插件页回退显示包名；
  同时删掉 `package.json` 里没有任何代码读取的顶层 `meta`。

### Changed

- **preset 与 DSH 0.2.1-rc.2 的 `standard` 逐行对齐**：补 `time-context`、`tool-schedule`、
  `tool-plugin-market`（disabled）；删掉当前宿主已不存在的 `tool-ralph`、以及
  `@deepseek-ai/dsh-tool-subagent` 里不再存在的 `backgroundMode`；plan-mode 文案跟进
  2026-10-09 那次「只在批准后离开 plan mode」的改动。

### Added

- 自检扩到 86 条：仓库根不得声明 `dsh`（防止再把根目录当组合包）、顶层 `engines.dsh`、
  两份 locale 的 `meta.title`/`meta.description` 必须齐备且不出现扁平的 `title`。

## [plugin 1.0.2 / skill 1.0.2] — 2026-10-19

### Added

- **`npm run privacy`**：扫本机绝对路径、回环地址、私有网段、访问令牌、邮箱与内部目录名；
  已并入 `npm run verify`，CI 自动执行。
- `conversation` 新增两条：**反应不必每次都有**（有就从口头池按语境随机挑，不复用）；
  **叙事用她的说法、事实不许改**（数字用比喻、失败自嘲、严重的事轻描淡写）。

### Fixed

- `证据与归属说明.md` 里指向本地工具链的路径改成「本地（不随仓库分发）」，
  不再暴露工作区目录结构。
- README / README.en / CONTRIBUTING / docs 同步口头池与隐私检查。
## [plugin 1.0.1 / skill 1.0.1] — 2026-10-19

### Added

- **口头池（`speechPools`）**：11 组、55 条按语境分组的短台词（得意／被夸／被质疑／嫌麻烦／甩锅／
  惊慌心虚／温柔／战斗／日常／被戳穿／挑衅），附在 `speech` 段后。
- 选句方式是「按语境随机挑一条」——不做查重、不记录用过哪条；语境错配才算错，说法不同不算错。

### Changed

- `build.mjs` 在渲染前把 `speechPools` 并进 `speech` 段，插件与 skill 共用同一份结果；
  包内 `character.json` 仍是未合并的原始副本。

### Fixed

- 池内条目已抽掉具体事件与专名：能原样用的（A 级）直接收，含情节的（B 级）改写为语气骨架，
  剧透过重的（C 级）弃用。逐条来源表留在本地，不随仓库分发。
## [plugin 1.0.0 / skill 1.0.0] — 2026-10-19

**改名 + 拆包：单仓双包，两套 tag。** 早先的 `dsh-character-hikari-rento` 2.x 系列到此为止。

### Changed（breaking）

- 项目改名：`dsh-character-hikari-rento` → `hikari-rento`；npm 包名同步改为 `hikari-rento`
  与 `hikari-rento-skill`。
- 拆成 monorepo：`packages/plugin`（DSH 插件）+ `packages/skill`（可移植 skill），
  共用根目录的 `character.json` 与 `references/`。两个包各自版本、各自 tag、各自 Release。
- 版本重置：插件 2.1.0 → **1.0.0**，skill 首次独立发行 **1.0.0**。
- tag 改为两套：`plugin-v*` / `skill-v*`。旧的 `v2.0.0` / `v2.1.0` 保留为历史，不再追加。
- 安装目标变为 `packages/plugin/`；`cordis.patch.yml` 里挂载的包名改为 `hikari-rento`。

### Added

- `scripts/package-plugin.mjs` 与 `scripts/package-skill.mjs`；`npm run pack` 一次打出两个包。
- 自检扩到 80 条：两个包的清单、patch、生成产物、参考档副本、README 一致性全覆盖。
- `packages/*/README.md` 改为生成物，随包版本自动更新。

### Removed

- 根目录不再是可以直接安装的 bundle：`index.js`、`cordis.patch.yml`、`locale/`、`icon.svg`
  都移进了 `packages/plugin/`。
## [2.1.0] — 2026-10-19

**并行发行 Skill 版。** 同一份 `character.json` 现在同时产出 DSH 插件与一份可移植 skill。

### Added

- `packages/skill/`：`SKILL.md`（frontmatter + 九段人设，`retrieval` 改写为技能内路由）、
  `references/`（四份参考档 + 索引的副本）、`NOTICE.md`（含**译者：明日风等**）、`LICENSE`。
- `scripts/package-skill.mjs` + `npm run skill`：打包成 `dist/hikari-rento-skill-<version>.tgz`。
- `docs/skill.md`：插件与 skill 的差别、生成/打包/安装方式。
- 自检新增 13 条 skill 断言（frontmatter、剧透-free 的 description、参考档齐全、NOTICE/许可证随包）。
- CI 增加「打包 skill 并上传 artifact」一步。

### Changed

- `scripts/build.mjs` 由「只出 `index.js`」升级为「出 9 个产物」，`npm run check` 逐个比对，
  插件与 skill 任何一边跑偏都会失败。
- README／README.en 增加 Skill 版章节、目录结构与命令更新。

### Fixed

- README 去 banner 大图；补翻译署名；公开文档（README／README.en／CONTRIBUTING／CHANGELOG）去剧透，
  两个 README 顶部加剧透提示。

## [2.0.0] — 2026-10-18

**从「工作区里的私有 bundle」变成可以公开发行的插件。** 角色内容与 1.1.0 一致，改的是外壳。

### Changed

- **包名**：`@local/hikari-rento` → `hikari-rento`（`@local` 作用域发不上 npm）。
  `cordis.patch.yml` 里挂载本插件的那一行、`index.js` 的 `@module` 标记同步更新。
- `package.json` 补齐发行元数据：`repository`、`homepage`、`bugs`、`publishConfig`、`engines`、
  `dsh.engines`、`exports`（含 `character.json` 与 `cordis.patch.yml`）与准确的 `files[]`。
- README 重写为中文主档 + 英文副档（`README.en.md`），补徽章、banner、安装/配置/结构/限制/授权各节。

### Added

- `scripts/build.mjs` + `scripts/index.template.js`：**生成链进了仓库**。`character.json` 是唯一真源，
  `npm run build` 生成两个包的产物，`npm run check` 检测产物与源文件是否一致。此前这步靠工作区里的 Python 脚本。
- `scripts/self-check.mjs`：50+ 条零依赖结构自检（清单、补丁、九个段落、生成物、参考档、locale、卫生）。
- `docs/`：安装、配置、架构、测试、发行五份说明。
- `CONTRIBUTING.md`、`NOTICE.md`（同人身份与素材归属）、`SECURITY.md`、`LICENSE`（MIT）。
- `.github/workflows/ci.yml`（Node 20 跑 `npm run verify`）、issue 模板、PR 模板。
- `.gitignore` / `.gitattributes`（统一 LF）。

### Removed

- 交付目录里的 `character.json.bak`（旧快照，已由 git 历史承担）。

## [1.1.0] — 2026-10-18

### Added

- **档案调用**：`detail: full` 在提示词末尾附一段路由，指向 `references/` 的四份参考档；
  路径由 `import.meta.url` 在加载时解析，不写死。

### Removed

- **`character-pure`（纯扮演）预设**：没有读文件工具，路由无从落地，只剩半套人设。

### Changed

- `character-standard` 改跑 `detail: full`。

## [1.0.1] — 2026-10-18

- 默认工具预设显示名改为「角色：恋兔光」。
- 工作流程统一为正常工程语气，只有最终回答转换为恋兔光口吻。
- `character.json`、`人设.md` 与生成的 `index.js` 同步。

## [1.0.0] — 2026-10-17

- 最终校对：统一了同名角色在不同次元的归属；补上「默认已被忘记」的记忆设定；
  把主次元与别次元的同名角色拆开处理。
- 补第六卷的人物关系网与知识边界四档标签。
- 新增 `world-commons.md`、`team-abilities.md`。
- 删除误归引用（「操纵人类……」「自由意志……」「你当我是谁啊？」等）。

## [0.9.0] — 2026-10-14

- 关系表自查第二轮：修正若干误归引用，人物关系的口径统一为「公开否认、私下亲近」。
- 补宿舍日常、后辈往事与几处卷末场面。
- 新增「不要认领没经历过的事」与「经历归属」防护块。
