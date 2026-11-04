# 测试

一条命令验完结构、生成物与交付文件；再往下是「怎么加断言」和人工验收。

## 一条命令

```bash
npm run verify
```

= `npm run check` + `npm test` + `npm run privacy`。CI 跑的就是它，在 Node 20 上**不装任何依赖**。

| 命令 | 做什么 |
|---|---|
| `npm run build` | `character.json` → 插件包与技能包的全部产物 |
| `npm run check` | 重算并逐个比对两个包的产物（不一致即失败） |
| `npm test` | `scripts/self-check.mjs` + `scripts/voice-test.mjs`：结构自检 + 文风层保护/校验测试 |
| `npm run privacy` | 扫本机绝对路径、回环地址、令牌、邮箱与内部目录名 |

## 自检覆盖什么

`scripts/self-check.mjs` 分五组，全部是「读文件 + 断言」，无网络、无依赖：

1. **清单**：名字可发布（无 `@local`、小写连字符）、SemVer、MIT、非 private、`publishConfig`、
   `repository`/`bugs`、关键词、`dsh.bundle.patch`、顶层 `engines.dsh`、`exports` 五项、
   `icon`、`files[]` 是否把运行时产物全带上。
2. **补丁**：挂载的包名正确、没有残留 `@local/`、恰好一个 agent preset、
   preset id 与显示名、**没有**挂 `@deepseek-ai/dsh-persona`（重名冲突）、
   默认 preset 的覆盖段存在、没有 tab 缩进。
3. **角色定义**：九个段落齐全且非空、`id`/`name`/`source`/`summary`、
   `retrieval` 保留 `{{REFERENCES_DIR}}` 占位符而其余段落没有花括号占位、
   示例台词结构正确且足够短、对话纪律与禁止自称的两条关键文案在位。
4. **生成物**：`apply` / `renderCharacterPrompt` / `character` 三个导出、插件名、`inject`、
   Config 五个字段、三个 detail 级别、无 `@@` 残留、`import.meta.url` 解析路径、`interpolate: false`。
5. **参考档与卫生**：五份参考档存在且索引链接齐全、两份 locale 的 `meta.title`/`meta.description` 齐备且没有扁平的 `title`、
   图标 < 256 KiB、README 覆盖全部配置字段、LICENSE/NOTICE/CHANGELOG/README.en/CONTRIBUTING/.gitignore 存在。

## 加一条断言

改 `scripts/self-check.mjs` 就行 —— 它只有 `check(name, ok, detail)` 和 `eq` 两个工具函数。
失败会打印全部失败项并以退出码 1 结束。

适合加断言的时机：改了补丁结构、加了配置项、加了段落、动了文件清单。

## 更深的宿主行为测试

仓库**不带**这些，因为它们需要 DSH 自己的包（`@deepseek-ai/schemastery` 等）：

- Config 的默认值与非法值拒绝；
- `apply()` 是否恰好注册一个段落、段落名/排序是否正确；
- `includeRuntimeContext: false` 是否触发抑制；
- 三个 detail 层级的包含关系；
- 路由段只在 `full` 出现，且路径已替换成绝对路径。

做法：在装了 DSH 的机器上，用 DSH 自带的 `@deepseek-ai/schemastery` 解析 `index.js` 的
`Config` 与 `renderCharacterPrompt()`，对每种配置跑一遍。维护者本地有一份这样的脚本，
不随仓库分发 —— 它依赖 DSH 的内部包，版本一换就会碎。

## 人工验收

结构测试证明不了「像不像」。维护者本地另有一份 16 题验收脚本，分三类：

1. **在场**：问她某件她确实在场的事（时间、地点、当时做了什么），看她说不说得出来。
2. **半径内**：她没亲历但属于她职责/住处/她定的规矩/她花的钱的事，看她是否只答自己那一截。
3. **半径外**：别人的私事、别校内规、别次元的事 —— 必须只有「不知道」。

判分只看两件事：**有没有编**、**该说的时候有没有全推掉**。
出现「我打过／我去过／我记得」这类冒认经历，是最严重的一类失败。

改完人设建议至少跑一遍第 3 类：那是提示词最容易漏气的地方。
