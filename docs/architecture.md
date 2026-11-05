# 架构

## 2.0 的两层

插件不再把完整人设塞进工作提示词。它只做两件事：

1. **工作层**：注册一段中立工程策略，告诉模型普通任务按工具与事实执行，只有恋兔光/世界观问题才查档案。
2. **最终回答层**：监听 `llm/stream`，只对「没有工具调用、只有文本」的最终回答做一次文风编辑。带 `【正文】/【吐槽】` 分块时，正文原样保留，只改写吐槽；没有分块时才整段改写。

```
安装 bundle
   │
   ├─ package.json  dsh.bundle.patch ─────────► cordis.patch.yml
   │                                              │
   │                                              ├─ insert: agent preset「character-standard」
   │                                              │     └─ plugins[] 里挂本包 + 官方 standard 的全套工具
   │                                              └─ override: agent-preset-registry.default
   │
   └─ index.js  apply(ctx, config)
         │
         ├─ 工作层
         │    └─ ctx.systemPrompt.section({
         │         name: character:work-policy,
         │         text: renderWorkPolicy(detail)
         │       })
         │
         └─ 最终回答层
              └─ ctx.on('llm/stream', (options, next) => wrapFinalAnswer(...))
                   ├─ 跳过辅助调用（没有 sessionId / 有 purpose）
                   ├─ 遇到 tool-call → 原样放行
                   ├─ 只缓冲纯文本回答
                   ├─ protectText：保护数字、路径、代码、URL、文件名
                   ├─ ctx.llm.stream：用同一 provider/model 做文风编辑
                   ├─ restoreText + validateRewrite：失败就回退原文
                   ├─ 事实校验调用：PASS 才采用，否则回退原文
                   └─ 输出改写后的文本块
```

## 为什么工作层不再放人设

旧版把 `deployment:persona-prefix` 注册成完整角色，结果是模型在**选工具、读文件、写中间进度**时也受口癖和情绪影响。2.0 把工作层改成中立策略：

- 工作过程不提恋兔光、不模仿她；
- 最终聊天回答仍由文风层变成她的口吻，普通任务和技术问答也一样；
- 只有明确问角色、世界观、经历、关系时，才按 `references/index.md` 查档；
- 被问「你是谁」时给一个最小身份，细节仍查档案。

## 为什么最终回答层是必经路径

用户装这个插件就是为了最终回答像恋兔光，所以文风编辑**没有用户开关**。它只在纯文本最终回答上运行；工具参数、文件内容、代码和中间进度不经过。

为了保护准确性：

- 数字、路径、代码块、URL、文件名在编辑前替换为占位符；
- 编辑后必须原样还原；
- 校验长度、占位符完整性和数字集合；
- 任何一项失败，直接回退原始工程回答。

**准确性优先于人设；人设可以失败，事实不能错。**

## 为什么补丁要写一整个 preset

DSH 的 agent preset 是一份**插件清单**。要让「干活能力和官方 `standard` 一样」这句话成立，
清单就得逐行对照官方 `standard` 写全。本包只替换官方 persona 行，并挂本插件。

两处刻意的选择：

1. **不挂 `@deepseek-ai/dsh-persona`。** 本插件不再注册 `deployment:persona-prefix`；工作层用 `character:work-policy`，不需要遮蔽部署级人设。
2. **不挂多余的插件。** 多一个工具就等于把「与 standard 等价」这句话变成假的。

## 生成链

```
character.json ──┬─（speechPools 并进 speech 段）──┐
references/ ─────┼────────────────────────────────┼─ scripts/build.mjs ─┬─► packages/plugin/（index.js、character.json、references/、README）
scripts/index.template.js ───────────────────────┘                     └─► packages/skill/（SKILL.md、references/、README）
```

- **`character.json` 与根目录 `references/` 是唯一真源。**
- **两个包里的产物都是生成的**：插件的 `index.js` 内嵌角色定义（运行时不读角色文件），
  skill 的 `SKILL.md` 是全文本；参考档在两边各放一份副本。
- **`speechPools`（口头池）在渲染时并进 `speech` 段**，插件与 skill 拿到同一份池子。
- `npm run check` 会重算全部产物并逐字节比对；`npm test` 还会跑文风层的纯函数测试。

## 运行期的 IO 只有一处

`REFERENCES_DIR`：

```js
const REFERENCES_DIR = fileURLToPath(new URL('./references/', import.meta.url));
```

用 `import.meta.url` 而不是 `process.cwd()` 或写死路径，所以插件装到哪个目录、
换哪台机器、npm 还是本地目录，都对。工作层的档案路由会把这个绝对路径写进提示词。

## 档案路由是「提示词级」的

工作层告诉模型在哪四类问题上去读哪一份；**这不是自动检索，也不是机制级校验**。模型可能该读不读、也可能不该读却去读。想卡死在世界观一致性上，需要额外的检索/审稿层，当前 2.0 不做这个承诺。

## 文件职责一览

| 文件 | 谁是它的读者 | 职责 |
|---|---|---|
| `package.json` | DSH / npm | bundle 清单、导出、文件清单、发行元数据 |
| `cordis.patch.yml` | DSH Loader | 声明 preset 并挂载本插件 |
| `index.js` | DSH Host | 插件本体（生成物） |
| `character.json` | 维护者 / 生成器 | 角色定义，唯一真源 |
| `scripts/index.template.js` | 生成器 | 插件外壳（工作层、文风层、Config、apply） |
| `scripts/build.mjs` | 维护者 / CI | 生成两个包的产物，`--check` 检测产物与源是否一致 |
| `scripts/self-check.mjs` | CI / 维护者 | 零依赖结构自检 |
| `scripts/voice-test.mjs` | CI / 维护者 | 文风层纯函数与 `llm/stream` 包装测试 |
| `references/*.md` | 她在运行时 | 按需读取的设定档案 |
| `人设.md` | 人 | `character.json` 的可读版 |
| `证据与归属说明.md` | 维护者 | 逐卷证据与误归属警告 |
