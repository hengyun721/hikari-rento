# 发行

两个包、两套 tag、两份 Release。这篇是发版时的操作手册。

## 0. 仓库

仓库是 `hengyun721/hikari-rento`，monorepo，两个包在 `packages/` 下：

| 包 | npm 名 | 内容 |
|---|---|---|
| `packages/plugin` | `hikari-rento` | DSH bundle 插件 |
| `packages/skill` | `hikari-rento-skill` | 可移植 skill |

改仓库地址（迁到别的账号 / 组织）时，统一替换 `hengyun721/hikari-rento` 即可，
徽章、`package.json` 的 `repository` / `homepage` / `bugs`、issue 模板里都有。

## 1. 本地检查

```bash
npm run verify        # 产物同步 + 93 条结构自检 + 文风层测试
npm run pack          # 两个包各打一份到 dist/
tar -tzf dist/hikari-rento-skill-1.0.2.tgz | head
```

`npm run pack` 会先跑一次 `--check`，确保打出来的是最新产物。

## 2. 发 npm

两个包独立发，版本各走各的：

```bash
# 插件
npm publish -w packages/plugin

# 技能
npm publish -w packages/skill
```

发之前确认：`packages/*/package.json` 的 `version` 已 bump、`publishConfig.access` 是 `public`、
`files[]` 没有多带东西（`npm pack --dry-run` 先看一眼）。

## 3. 打 tag 与 Release

**两套 tag，互不牵连**：

```bash
# 插件
V=$(node -p "require('./packages/plugin/package.json').version")
git tag plugin-v$V && git push origin plugin-v$V

# 技能
V=$(node -p "require('./packages/skill/package.json').version")
git tag skill-v$V && git push origin skill-v$V
```

每个 tag 发各自的 Release，附件用 `dist/` 里对应那份 tgz：

```bash
gh release create plugin-v1.0.0 dist/hikari-rento-1.0.0.tgz --title "hikari-rento v1.0.0"
gh release create skill-v1.0.0  dist/hikari-rento-skill-1.0.0.tgz --title "hikari-rento-skill v1.0.0"
```

Release 说明从 `CHANGELOG.md` 对应小节抄；标题带上包名，别让人分不清是哪一个。

## 4. 发版检查单

- [ ] `npm run verify` 全绿
- [ ] `npm run pack` 两份 tgz 都出来了，内容没有多余文件
- [ ] 只改了人设 → 两个包版本都要动吗？（只动受影响的，但**产物必须一起重建**）
- [ ] `CHANGELOG.md` 写了这一版
- [ ] tag 名与包名对得上（`plugin-v*` / `skill-v*`）
- [ ] Release 附件是**本包**那份，不是另一个
- [ ] 装一遍试：插件新建会话、skill 说一句「恋兔光模式」

## 版本号约定

| 改动 | 版本 |
|---|---|
| 只改人设文本、参考档 | 两个包都 patch |
| 新增配置项、新增段落、生成器行为变化 | 插件 minor；skill 看是否受影响 |
| 包名、preset id、挂载方式、目录结构 | major |

人设改动也记进 `CHANGELOG.md`：谁在哪一版把哪句台词改了，日后校对时能救命。