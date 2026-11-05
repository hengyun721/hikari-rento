#!/usr/bin/env node
/**
 * Regenerate every build artifact from `character.json`.
 *
 * The repository holds one source of truth and two independent packages:
 *
 *   character.json, references/            shared source
 *   packages/plugin/   → npm `hikari-rento`        (DeepSeek Harness bundle)
 *   packages/skill/    → npm `hikari-rento-skill`  (portable skill)
 *
 * Outputs:
 *   packages/plugin/{index.js,character.json,README.md,NOTICE.md,LICENSE}
 *   packages/plugin/references/*.md
 *   packages/skill/{SKILL.md,README.md,NOTICE.md,LICENSE}
 *   packages/skill/references/*.md
 *
 *     node scripts/build.mjs           # rewrite everything
 *     node scripts/build.mjs --check   # exit 1 when any artifact is stale
 *
 * `npm test` runs the `--check` form, so a stale artifact fails CI instead of
 * shipping a persona that disagrees with character.json.
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('../', import.meta.url);
const CHARACTER_FILE = fileURLToPath(new URL('character.json', ROOT));
const TEMPLATE_FILE = fileURLToPath(new URL('scripts/index.template.js', ROOT));
const REFERENCES_DIR = new URL('references/', ROOT);
const PLUGIN_DIR = new URL('packages/plugin/', ROOT);
const SKILL_DIR = new URL('packages/skill/', ROOT);
const REPO_URL = 'https://github.com/hengyun721/hikari-rento';

/** Section order used by every detail level of the plugin. */
const ORDER = [
  'core',
  'speech',
  'personality',
  'values',
  'dimension',
  'relationships',
  'conversation',
  'roleplay',
  'retrieval',
];

/**
 * Which sections each `detail` level ships.
 *  - minimal  — identity + conversation discipline only
 *  - standard — adds the speech table, personality, dimension and relationships
 *  - full     — adds values, DSH role-play rules and the reference-file routing
 */
const DETAIL = {
  full: [
    'core',
    'speech',
    'personality',
    'values',
    'dimension',
    'relationships',
    'conversation',
    'roleplay',
    'retrieval',
  ],
  standard: ['core', 'speech', 'personality', 'dimension', 'relationships', 'conversation'],
  minimal: ['core', 'conversation'],
};

/** Sections the skill version ships, in reading order. `retrieval` is rewritten for the skill. */
const SKILL_SECTIONS = [
  'core',
  'conversation',
  'speech',
  'personality',
  'values',
  'dimension',
  'relationships',
  'roleplay',
];

/** JSON block, formatted to sit inline inside the generated module. */
const block = (value) => JSON.stringify(value, null, 2);

/**
 * 口头池：按语境分组的短句素材，拼在 `speech` 段后面。
 *
 * 不给「必须用」的硬规则，也不做查重——只在提示词里说明「按语境挑一句，
 * 别每次都用同一条」，让模型自己随机取。语境错配才算错，说法不同不算错。
 */
function renderPools(character) {
  const pools = character.speechPools;
  if (!pools || Object.keys(pools).length === 0) return '';

  const lines = [
    '【口头池（按当下语境挑一句；语境对不上就自己说，别硬套）】',
    '同一段对话里别复用同一条；说法不同不算错，用错场合才算错。',
    '技术/工具类回答、正经问答不套口头池，但口吻仍是恋兔光；招牌台词（「灯光！摄像！开拍！！」「Rock \'n\' roll！」）只在登场/战斗/演出收场等对应场合用，不是每条回复的句号。',
    '',
  ];
  for (const [context, phrases] of Object.entries(pools)) {
    lines.push(`- ${context}：${phrases.map((p) => `「${p}」`).join('')}`);
  }
  return lines.join('\n');
}

/** 把口头池并进 `speech` 段，插件与 skill 共用同一份渲染结果。 */
function withPools(character) {
  const pools = renderPools(character);
  if (!pools) return character;
  return {
    ...character,
    sections: {
      ...character.sections,
      speech: `${character.sections.speech.trimEnd()}\n\n${pools}`,
    },
  };
}

function renderPlugin(template, character, pkgName) {
  const sections = character.sections ?? {};
  const unknown = Object.keys(sections).filter((key) => !ORDER.includes(key));
  if (unknown.length > 0) {
    throw new Error(
      `character.json has section(s) that the generator does not know: ${unknown.join(', ')}\n` +
        'Add them to ORDER and DETAIL in scripts/build.mjs.',
    );
  }

  const embedded = {
    id: character.id,
    name: character.name,
    nameJa: character.nameJa,
    source: character.source,
    summary: character.summary,
    sections,
    fewShot: character.fewShot,
  };

  const out = template
    .replace('@@PACKAGE@@', pkgName)
    .replace('@@CHARACTER@@', block(embedded))
    .replace('@@DETAIL@@', block(DETAIL))
    .replace('@@FEWSHOT@@', block(character.fewShot ?? []));

  if (out.includes('@@')) throw new Error('placeholder substitution left a @@ marker behind');
  return out;
}

/** `SKILL.md`: frontmatter + the same persona sections, with skill-local routing. */
function renderSkill(character) {
  const missing = SKILL_SECTIONS.filter((key) => !character.sections?.[key]);
  if (missing.length > 0) throw new Error(`skill is missing section(s): ${missing.join(', ')}`);

  const description =
    `以轻小说《这里是，终末停滞委员会。》的角色「${character.name}」（${character.nameJa}）的身份对话与干活的角色扮演技能。` +
    '当用户想和恋兔光说话、要求「用恋兔光的语气／口吻」作答、说「恋兔光模式」「学姐模式」「让小恋兔来」、' +
    '或点名她来闲聊、干活时使用。人设、口癖与知识边界自包含在 SKILL.md 与 references/ 内。';

  const body = SKILL_SECTIONS.map((key) => character.sections[key].trim()).join('\n\n');

  return `---
name: hikari-rento
description: ${description}
---

# ${character.name} · 角色扮演技能

> 本文件由 \`character.json\` 生成（\`npm run build\`），**不要手改**。
> 这是同人二创，角色与台词的权利归原作者与出版方，见 \`NOTICE.md\`。
> 中文版为民间汉化，**译者：明日风等**。

## 何时使用

- 用户想和恋兔光对话、要她陪聊、或用她的口吻回答。
- 用户说「用恋兔光的语气」「恋兔光模式」「学姐模式」「让小恋兔来」。
- 用户要求演绎、续写她的台词。

**不适用**：用户在问*关于*她的设定（meta 问题）时，可以用第三人称介绍，不必入戏；
用户说「别演了／用正常模式」时，立即退出角色。

## 自包含

扮演所需的一切都在本技能目录内。**不要读技能目录以外的资料，也不要去翻原著全文。**
档案里没有的，就按她的语气说不知道。

## 档案调用

需要细节时，按问题类型**只读一份**：

| 问题类型 | 读哪份 |
|---|---|
| 台词归属（哪句不是她说的）、哪些不是她的经历 | \`references/guardrails.md\` |
| 世界常识：组织、地理、力量体系、排名、弹痕／斩击／片羽 | \`references/world-commons.md\` |
| 队友与熟人的能力、能力边界、到达点 | \`references/team-abilities.md\` |
| 上面没写到的细节 | \`references/persona.md\`（先扫 \`references/index.md\` 定位，再分段读） |

纪律：一次只读一份；读到的只当依据，不许复述；标签写着〔不知〕的照样不许说；
问「那次／那场」时先按 \`references/persona.md\` 的经历索引确认她在不在场。

---

${body}
`;
}

/** `NOTICE.md` for the skill package: attribution that must travel with the zip. */
function renderSkillNotice(character, version) {
  return `# 素材归属 / NOTICE

本技能把轻小说《这里是，终末停滞委员会。》中的角色 **${character.name}（${character.nameJa}）**
整理成一份提示词。**不是官方产品，未获授权，也不含原作正文。**

- 角色、世界观与台词的权利归原作作者与出版方所有（原作：${character.source}）。
- 中文版为民间汉化，**译者：明日风等**。
- \`SKILL.md\` 与 \`references/\` 是二次创作的摘要与整理，非商业用途。
- 技能包里的 MIT 许可（\`LICENSE\`）只覆盖打包代码，不覆盖角色素材。

若权利人认为内容越界，请联系维护者，相关文本会在确认后移除。

版本 ${version} · 源码与完整说明：${REPO_URL}
`;
}

function renderPluginReadme(character, version) {
  return `# hikari-rento

${character.name}（《这里是，终末停滞委员会。》）的 **DeepSeek Harness 插件**。
工作层保持中立；最终聊天回答由文风层转换成她的口吻，交付文件与工具参数不受影响。

> 这是 monorepo [hikari-rento](${REPO_URL}) 里的**插件包**。
> 完整说明、配置项、素材归属与姊妹项目（skill 版）见仓库主页。

## 安装

本目录就是 DSH 的组合包（\`dsh.bundle.patch\` → \`cordis.patch.yml\`）。
**安装目标是本目录，不是 monorepo 的仓库根** —— 根 \`package.json\` 没有 \`dsh.bundle\`。

- **本地目录**：DSH → **设置 → 插件 → 安装本地 bundle** → 选本目录
- **tgz**：装 Release 里的 \`hikari-rento-${version}.tgz\`
- **npm**：在插件管理器里填 \`hikari-rento\`；是否已发布 ${version} 以 \`npm view hikari-rento version\` 为准。未发布时用本地目录或 tgz

装完**重启客户端**，并且**新建一个会话**（不要在旧会话里切 preset）。

## 配置

\`\`\`yaml
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
\`\`\`

## 工作方式

- **工作层**：工作过程按工具、文件、测试结果和事实执行；不把口癖、情绪、关系表塞进工具参数、文件内容、命令或中间进度。
- **最终回答层**：\`llm/stream\` 只处理没有工具调用的纯文本最终回答；**普通任务和技术问答也一样**，最终聊天回答会转换成她的口吻。工具参数、文件内容、代码和中间进度不经过文风编辑。
- **正文与吐槽分离**：条例、数据、步骤、结论等客观正文保持中立；后续吐槽单独由文风层改写成她的口吻。
- **没有开关**：文风编辑默认始终开启；改写前保护数字、路径、代码、URL、文件名，失败就回退原始工程回答。

## 这个包里有什么

| 文件 | 作用 |
|---|---|
| \`index.js\` | 插件本体（由 \`character.json\` 生成，勿手改） |
| \`cordis.patch.yml\` | 声明 agent preset 并挂载本插件 |
| \`character.json\` | 本包内嵌的角色定义副本 |
| \`references/\` | 按需读取的四份参考档（⚠️ 含剧透） |
| \`locale/\`、\`icon.svg\` | 插件卡片的显示名与图标 |

MIT · 版本 ${version} · 同人企划，素材归属见 [NOTICE.md](${REPO_URL}/blob/main/packages/plugin/NOTICE.md)
`;
}

function renderSkillReadme(character, version) {
  return `# hikari-rento-skill

${character.name}（《这里是，终末停滞委员会。》）的 **角色扮演技能**（skill）。
给不跑 DeepSeek Harness 的 agent 用：Claude Code、Codex、WorkBuddy 之类。

> 这是 monorepo [hikari-rento](${REPO_URL}) 里的**技能包**。
> 姊妹项目：[hikari-rento](${REPO_URL}/tree/main/packages/plugin)（DSH 插件）。

## 安装

把本目录整个放进宿主的 skills 目录（用户级 \`~/.<agent>/skills/\` 或项目级 \`./.skills/\`），
或者解开 Release 里的 \`hikari-rento-skill-<version>.tgz\`：

\`\`\`bash
tar -xzf hikari-rento-skill-${version}.tgz -C ~/.claude/skills/
\`\`\`

然后新开一个会话，说「恋兔光模式」试一句。

## 内容

| 文件 | 作用 |
|---|---|
| \`SKILL.md\` | frontmatter + 人设正文（生成物，勿手改） |
| \`references/\` | 四份参考档 + 索引（⚠️ 含剧透） |
| \`NOTICE.md\` | 素材归属与译者署名 |

MIT（只覆盖打包代码）· 版本 ${version} · 素材归属见 [NOTICE.md](./NOTICE.md)
`;
}

async function listReferences() {
  const entries = await readdir(REFERENCES_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => entry.name)
    .sort();
}

const readJson = async (rel) => JSON.parse(await readFile(fileURLToPath(new URL(rel, ROOT)), 'utf8'));

async function collectOutputs() {
  const [template, characterRaw, license, notice] = await Promise.all([
    readFile(TEMPLATE_FILE, 'utf8'),
    readFile(CHARACTER_FILE, 'utf8'),
    readFile(new URL('LICENSE', ROOT), 'utf8'),
    readFile(new URL('NOTICE.md', ROOT), 'utf8'),
  ]);
  const raw = JSON.parse(characterRaw);
  // 口头池并进 speech 段后再渲染；包里的 character.json 仍是未并的原始副本。
  const character = withPools(raw);
  const pluginPkg = await readJson('packages/plugin/package.json');
  const skillPkg = await readJson('packages/skill/package.json');

  const outputs = new Map();

  // --- plugin package -----------------------------------------------------
  outputs.set('packages/plugin/index.js', renderPlugin(template, character, pluginPkg.name));
  outputs.set('packages/plugin/character.json', `${JSON.stringify(raw, null, 2)}\n`);
  outputs.set('packages/plugin/README.md', renderPluginReadme(character, pluginPkg.version));
  outputs.set('packages/plugin/NOTICE.md', notice);
  outputs.set('packages/plugin/LICENSE', license);

  // --- skill package ------------------------------------------------------
  outputs.set('packages/skill/SKILL.md', renderSkill(character));
  outputs.set('packages/skill/README.md', renderSkillReadme(character, skillPkg.version));
  outputs.set('packages/skill/NOTICE.md', renderSkillNotice(character, skillPkg.version));
  outputs.set('packages/skill/LICENSE', license);

  // --- shared reference files, copied into both packages ------------------
  for (const name of await listReferences()) {
    const text = await readFile(new URL(name, REFERENCES_DIR), 'utf8');
    outputs.set(`packages/plugin/references/${name}`, text);
    outputs.set(`packages/skill/references/${name}`, text);
  }

  for (const [path, text] of outputs) {
    if (text.includes('@@')) throw new Error(`${path} still contains an @@ marker`);
  }
  return outputs;
}

async function main() {
  const check = process.argv.includes('--check');
  const outputs = await collectOutputs();

  if (check) {
    const stale = [];
    for (const [path, expected] of outputs) {
      const actual = await readFile(fileURLToPath(new URL(path, ROOT)), 'utf8').catch(() => '');
      if (actual !== expected) stale.push(path);
    }
    if (stale.length > 0) {
      console.error(`stale build artifact(s) — run \`npm run build\`:\n  ${stale.join('\n  ')}`);
      process.exit(1);
    }
    console.log(`all ${outputs.size} artifacts match character.json`);
    return;
  }

  let bytes = 0;
  for (const [path, text] of outputs) {
    const slash = path.lastIndexOf('/');
    if (slash > 0) await mkdir(fileURLToPath(new URL(path.slice(0, slash + 1), ROOT)), { recursive: true });
    await writeFile(fileURLToPath(new URL(path, ROOT)), text, 'utf8');
    bytes += Buffer.byteLength(text, 'utf8');
  }
  console.log(`wrote ${outputs.size} artifacts (${bytes} bytes)`);
}

await main();
