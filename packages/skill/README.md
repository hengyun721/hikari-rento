# hikari-rento-skill

恋兔光（《这里是，终末停滞委员会。》）的 **角色扮演技能**（skill）。
给不跑 DeepSeek Harness 的 agent 用：Claude Code、Codex、WorkBuddy 之类。

> 这是 monorepo [hikari-rento](https://github.com/hengyun721/hikari-rento) 里的**技能包**。
> 姊妹项目：[hikari-rento](https://github.com/hengyun721/hikari-rento/tree/main/packages/plugin)（DSH 插件）。

## 安装

把本目录整个放进宿主的 skills 目录（用户级 `~/.<agent>/skills/` 或项目级 `./.skills/`），
或者解开 Release 里的 `hikari-rento-skill-<version>.tgz`：

```bash
tar -xzf hikari-rento-skill-1.1.0.tgz -C ~/.claude/skills/
```

然后新开一个会话，说「恋兔光模式」试一句。

## 在 Claude Code / Codex 里怎么用

这是一个**提示词级 skill**，不是 DSH 插件：它没有 `llm/stream` 钩子，不能自动保护代码/表格或做事实校验。它的“交付前自检”是写给模型的流程，不是宿主保证。

| 平台 | 放置与触发 | 建议 |
|---|---|---|
| **Claude Code** | 放到用户级 `~/.claude/skills/hikari-rento/`，或项目级 `.claude/skills/hikari-rento/`；新会话里说「恋兔光模式」 | 让 skill 按 description 自动加载；如果没触发，直接说「读取 hikari-rento 的 SKILL.md，然后按恋兔光模式回答」 |
| **Codex** | 按当前 Codex 版本的 skill/agent 目录放置；没有自动加载时，在项目 `AGENTS.md` 里写一句「遇到恋兔光模式先读 `.skills/hikari-rento/SKILL.md`」 | Codex 更依赖显式指令；开头直接说「先读 SKILL.md 和 references，再回答」 |
| **其他 agent** | 把本目录放到宿主的 skills 目录，或在系统提示里引用 `SKILL.md` | 不支持 skill 自动加载时，用一段短 wrapper 指向 `SKILL.md`，不要把全文反复粘进每次对话 |

推荐开场：

```text
恋兔光模式。先读 SKILL.md；技术结论要准确，代码、表格、路径不要改，
最后用你的口吻总结。交付前按 SKILL.md 的“最终回答协议”自检。
```

长任务再加一句：

```text
工作过程保持正常工程语气；最终回答再转换口吻。
```

## 能力边界

- **有**：人设、口癖、知识边界、技术回答锚点、交付前自检流程。
- **没有**：自动占位符保护、数字/结构校验、事实校验、分段失败回退、`DSH_HIKARI_DEBUG`。
- 需要和插件 2.1.0 同级的运行时审查时，使用 DSH 插件，或在宿主里接一个 finalizer/MCP 工具；不要指望 skill 自己保证。

## 内容

| 文件 | 作用 |
|---|---|
| `SKILL.md` | frontmatter + 人设正文（生成物，勿手改） |
| `references/` | 四份参考档 + 索引（⚠️ 含剧透） |
| `NOTICE.md` | 素材归属与译者署名 |

MIT（只覆盖打包代码）· 版本 1.1.0 · 素材归属见 [NOTICE.md](./NOTICE.md)
