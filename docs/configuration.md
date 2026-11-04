# 配置

插件只有一处可配：`cordis.patch.yml` 里挂载本插件的那一行。

```yaml
- id: character-hikari-rento
  name: 'hikari-rento'
  config:
    detail: full              # minimal | standard | full
    fewShotEnabled: true
    sectionName: character:work-policy
    sectionOrder: 0
    overrideIdentity: true
    identityText: You are an AI assistant.
    includeRuntimeContext: true
```

## 字段

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `detail` | `'minimal' \| 'standard' \| 'full'` | `standard` | **工作层**的档案路由深度。非法值会在激活时被 Config 校验拒绝 |
| `fewShotEnabled` | boolean | `true` | 文风编辑是否附加 `fewShot` 里的示例台词；只影响最终回答的语气 |
| `sectionName` | string | `character:work-policy` | 工作层策略注册到提示词注册表的段落名 |
| `sectionOrder` | number | `0` | 工作层段落排序 |
| `overrideIdentity` | boolean | `true` | 是否遮蔽 DSH 自带的 `harness:identity`。见下方「身份段与上游指纹」 |
| `identityText` | string | `You are an AI assistant.` | 遮蔽后的身份段文案；默认中性 |
| `includeRuntimeContext` | boolean | `true` | 是否保留运行时上下文快照 |

## 2.0 的工作方式

插件分成两层，**没有「要不要人设」的开关**：

1. **工作层**：中立工程策略。普通任务按工具、文件、测试结果和事实执行；不把口癖、情绪、关系表塞进工作过程。
2. **最终回答层**：监听 `llm/stream`，只处理**没有工具调用、只有文本**的最终回答；把文字改写成恋兔光口吻。工具参数、文件内容、代码和中间进度都不经过这一层。

文风编辑默认始终开启。改写前会保护数字、路径、代码块、URL 和文件名；编辑后校验，异常就回退原始工程回答。**准确性优先于人设。**

## `detail` 到底差多少

`detail` 现在只影响工作层的档案路由：

| 级别 | 工作层内容 | 适合 |
|---|---|---|
| `minimal` | 中立工程策略；不附档案路由 | 完全不需要查设定 |
| `standard` | 中立工程策略 + `references/index.md` 路由 | 聊天为主 |
| `full` | 再追加档案纪律（标签优先、不在场不认领、查不到就说不知道） | **本包 preset 使用**，干活 + 聊天 |

人设口吻由文风编辑使用 `character.json` 里的 `speech`、`personality`、`values`、`conversation`、`roleplay` 和 `fewShot` 生成；**不随 `detail` 变化**，也没有关掉人设的配置。

## `sectionName` 与全局挂载

默认值 `character:work-policy` 只是工作层策略的段落名，不再遮蔽部署级人设。

- 挂在 **preset 里**（本包的做法）：保持默认即可。
- 挂在 **全局**：同一作用域内不能有同名段落；如果和其他插件冲突，换一个名字（如 `character:hikari-rento`）。这不是「替换身份」，只是附加一段工作策略。

## 身份段与中转风控

DSH 默认会在提示词最前面放一句自带的身份：

```text
You are an AI agent powered by DeepSeek Harness.
```

不少第三方中转 / 代理服务会对 system 里的固定模板句做**逐字风控**。命中后它不会只丢那一句：中转会用自家的中性提示词替换**整段 system**，模型只看到「You are a helpful assistant」，工作层与最终回答层都会失效。

插件默认开启 `overrideIdentity`，用同名段（`harness:identity`）遮蔽原文，换成 `identityText`（默认 `You are an AI assistant.`）。这是中性工作身份，不是角色扮演；角色语气由最终回答层处理。

- 全局挂载时必须设 `overrideIdentity: false`：同一作用域不能有同名段。
- 如果中转仍然风控，把 `identityText` 换一句更中性的（如 `You are a helpful assistant.`）。

## `sectionOrder`

`0`（默认）把工作层放在提示词前面。它不再承担「尾锚」职责；2.0 已删除尾锚，因为最终回答层是必经路径，尾锚再喊一遍身份只会重复。

## `includeRuntimeContext`

关掉会把运行时上下文快照（沙箱策略、审批策略、委派说明）一起移除 —— **全有全无**。
除非你明确知道自己在做什么，别关。

## 让它不再是默认 preset

`cordis.patch.yml` 末尾这一段把**新建会话的默认 preset** 设成了本插件：

```yaml
- id: agent-preset-registry
  name: '@deepseek-ai/dsh-agent-preset-registry'
  config:
    default: character-standard
```

删掉整段再重装，默认就回到 DSH 自己的 preset；之后在会话的「Agent 预设」选择器里手动选她。

> 注意：`config` 是**整体替换**，这段必须写全，不能只写 `default` 一项的一半。

## 改角色本身

**人设内容在 `character.json`**；工作层策略和文风规则在 `scripts/index.template.js`。改完执行：

```bash
npm run build
```

`index.js` 会重新生成；`npm run check` 能验出它和源文件对不对得上。
