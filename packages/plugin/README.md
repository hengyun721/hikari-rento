# hikari-rento

恋兔光（《这里是，终末停滞委员会。》）的 **DeepSeek Harness 插件**。
工作层保持中立；最终聊天回答由文风层转换成她的口吻，交付文件与工具参数不受影响。

> 这是 monorepo [hikari-rento](https://github.com/hengyun721/hikari-rento) 里的**插件包**。
> 完整说明、配置项、素材归属与姊妹项目（skill 版）见仓库主页。

## 安装

本目录就是 DSH 的组合包（`dsh.bundle.patch` → `cordis.patch.yml`）。
**安装目标是本目录，不是 monorepo 的仓库根** —— 根 `package.json` 没有 `dsh.bundle`。

- **本地目录**：DSH → **设置 → 插件 → 安装本地 bundle** → 选本目录
- **tgz**：装 Release 里的 `hikari-rento-2.1.0.tgz`
- **npm**：在插件管理器里填 `hikari-rento`；是否已发布 2.1.0 以 `npm view hikari-rento version` 为准。未发布时用本地目录或 tgz

装完**重启客户端**，并且**新建一个会话**（不要在旧会话里切 preset）。

## 配置

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

## 工作方式

- **工作层**：工作过程按工具、文件、测试结果和事实执行；不把口癖、情绪、关系表塞进工具参数、文件内容、命令或中间进度。
- **最终回答层**：`llm/stream` 只处理没有工具调用的纯文本最终回答；**普通任务和技术问答也一样**，最终聊天回答会转换成她的口吻。工具参数、文件内容、代码和中间进度不经过文风编辑。
- **交付前审查**：改写前保护代码、表格、路径、URL、数字和文件名；改写后逐段还原、校验数字/结构和只读内容，再做一次事实校验。任何一段失败只回退该段。
- **分段与格式**：长回答按约 1500 字分段，表格/代码/列表保持原子；原始 `finish` 不是 `stop` 时直接放行，避免润色截断内容。
- **技术回答锚点**：技术场景 few-shot、开头/中段/结尾锚点、长回答轻量收尾；不是每句硬塞语气词。
- **可观测**：`DSH_HIKARI_DEBUG=1` 记录钩子、分段、占位符和失败原因，不打印正文。

## 这个包里有什么

| 文件 | 作用 |
|---|---|
| `index.js` | 插件本体（由 `character.json` 生成，勿手改） |
| `cordis.patch.yml` | 声明 agent preset 并挂载本插件 |
| `character.json` | 本包内嵌的角色定义副本 |
| `references/` | 按需读取的四份参考档（⚠️ 含剧透） |
| `locale/`、`icon.svg` | 插件卡片的显示名与图标 |

MIT · 版本 2.1.0 · 同人企划，素材归属见 [NOTICE.md](https://github.com/hengyun721/hikari-rento/blob/main/packages/plugin/NOTICE.md)
