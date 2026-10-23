#!/usr/bin/env node
/**
 * Dependency-free structural checks for the monorepo.
 *
 *     npm test        # node scripts/self-check.mjs
 *
 * They run anywhere Node 20 is available — no DSH install, no node_modules —
 * which is what CI needs. They cover the two package manifests, the bundle
 * patch, the shared character source, and every generated artifact.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('../', import.meta.url);
const read = (rel) => readFile(fileURLToPath(new URL(rel, ROOT)), 'utf8');
const exists = async (rel) => {
  try {
    await stat(fileURLToPath(new URL(rel, ROOT)));
    return true;
  } catch {
    return false;
  }
};

let passed = 0;
const failures = [];

function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    return;
  }
  failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
}

const root = JSON.parse(await read('package.json'));
const pluginPkg = JSON.parse(await read('packages/plugin/package.json'));
const skillPkg = JSON.parse(await read('packages/skill/package.json'));
const patch = await read('packages/plugin/cordis.patch.yml');
const character = JSON.parse(await read('character.json'));
const index = await read('packages/plugin/index.js');
const readme = await read('README.md');
const detailLevels = ['minimal', 'standard', 'full'];
const configFields = ['detail', 'fewShotEnabled', 'sectionName', 'sectionOrder', 'anchorEnabled', 'overrideIdentity', 'identityText', 'includeRuntimeContext'];

// --------------------------------------------------------------------------
// monorepo root
// --------------------------------------------------------------------------
check('root: private package', root.private === true);
check('root: declares both workspaces', Array.isArray(root.workspaces) &&
  root.workspaces.includes('packages/*'));
check('root: build / check / test / verify scripts exist',
  ['build', 'check', 'test', 'verify'].every((s) => typeof root.scripts?.[s] === 'string'));
check('root: packaging scripts for both editions',
  typeof root.scripts?.['pack:plugin'] === 'string' && typeof root.scripts?.['pack:skill'] === 'string');
check('root: repository points at hikari-rento',
  (root.repository?.url ?? '').includes('github.com/hengyun721/hikari-rento'));
// From 1.0.0 the bundle lives in packages/plugin. A root that declares `dsh` would let
// people install the monorepo root and collect a `not-a-bundle` refusal; an entry point
// would make it look installable while its patch path leads nowhere.
check('root: is not a bundle — no dsh field and no entry point',
  root.dsh === undefined && root.main === undefined && root.exports === undefined);

// --------------------------------------------------------------------------
// plugin package
// --------------------------------------------------------------------------
check('plugin: name is hikari-rento', pluginPkg.name === 'hikari-rento', pluginPkg.name);
check('plugin: version is semver', /^\d+\.\d+\.\d+(?:-[\w.]+)?$/.test(pluginPkg.version), pluginPkg.version);
check('plugin: description present', typeof pluginPkg.description === 'string' && pluginPkg.description.length > 20);
check('plugin: MIT + public', pluginPkg.license === 'MIT' && pluginPkg.publishConfig?.access === 'public');
check('plugin: not marked private', pluginPkg.private !== true);
check('plugin: repository.directory is packages/plugin', pluginPkg.repository?.directory === 'packages/plugin');
check('plugin: exports "." resolves to index.js', pluginPkg.exports?.['.'] === './index.js');
check('plugin: exports exposes character.json and the patch',
  pluginPkg.exports?.['./character.json'] === './character.json' &&
    pluginPkg.exports?.['./cordis.patch.yml'] === './cordis.patch.yml');
check('plugin: exports exposes locale glob', pluginPkg.exports?.['./locale/*.json'] === './locale/*.json');
check('plugin: dsh.bundle.patch declared', pluginPkg.dsh?.bundle?.patch === './cordis.patch.yml');
// DSH reads a top-level `engines.dsh`; the old `dsh.engines` nest is read by nothing,
// so asserting it let an unenforced version gate look enforced.
check('plugin: engines.dsh pinned at the top level', typeof pluginPkg.engines?.dsh === 'string');
check('plugin: no dsh.engines nest', pluginPkg.dsh?.engines === undefined);
check('plugin: icon declared', pluginPkg.icon === './icon.svg');
const requiredInFiles = ['index.js', 'character.json', 'cordis.patch.yml', 'icon.svg', 'locale/*.json', 'references/*.md'];
check('plugin: files[] ships every runtime artifact',
  requiredInFiles.every((entry) => pluginPkg.files?.includes(entry)),
  requiredInFiles.filter((entry) => !pluginPkg.files?.includes(entry)).join(', '));
check('plugin: files[] leaves build tooling out', !pluginPkg.files?.some((f) => f.startsWith('scripts')));
// DSH reads display text from locale JSON under `meta`; a flat `title` is silently ignored
// and the panel falls back to the package name.
for (const language of ['en', 'zh']) {
  const dict = JSON.parse(await read(`packages/plugin/locale/${language}.json`));
  check(`plugin locale ${language}: meta.title and meta.description are set`,
    [dict.meta?.title, dict.meta?.description].every((v) => typeof v === 'string' && v.trim() !== ''));
  check(`plugin locale ${language}: no flat title/description`, dict.title === undefined && dict.description === undefined);
}

// --------------------------------------------------------------------------
// skill package
// --------------------------------------------------------------------------
check('skill: name is hikari-rento-skill', skillPkg.name === 'hikari-rento-skill', skillPkg.name);
check('skill: version is semver', /^\d+\.\d+\.\d+(?:-[\w.]+)?$/.test(skillPkg.version), skillPkg.version);
check('skill: MIT + public', skillPkg.license === 'MIT' && skillPkg.publishConfig?.access === 'public');
check('skill: repository.directory is packages/skill', skillPkg.repository?.directory === 'packages/skill');
check('skill: files[] ships SKILL.md, references, NOTICE and LICENSE',
  ['SKILL.md', 'references/*.md', 'NOTICE.md', 'LICENSE'].every((entry) => skillPkg.files?.includes(entry)));

// --------------------------------------------------------------------------
// bundle patch
// --------------------------------------------------------------------------
check('patch: mounts hikari-rento', patch.includes("name: 'hikari-rento'"));
check('patch: no old package name left', !patch.includes('dsh-character-hikari-rento') && !patch.includes('@local/'));
check('patch: declares exactly one agent preset',
  (patch.match(/name: '@deepseek-ai\/dsh-agent-preset'/g) ?? []).length === 1);
check('patch: preset id is character-standard', patch.includes('id: character-standard'));
check('patch: preset display name is set', patch.includes('name: 角色：恋兔光'));
check('patch: does not mount @deepseek-ai/dsh-persona (section-name collision)',
  !patch.includes("name: '@deepseek-ai/dsh-persona'"));
check('patch: overrides the default agent preset',
  patch.includes('id: agent-preset-registry') && patch.includes('default: character-standard'));

// --------------------------------------------------------------------------
// shared character source
// --------------------------------------------------------------------------
const sectionNames = ['core', 'speech', 'personality', 'values', 'dimension', 'relationships', 'conversation', 'roleplay', 'retrieval'];
const missingSections = sectionNames.filter((name) =>
  typeof character.sections?.[name] !== 'string' || character.sections[name].trim() === '');
check('character.json: all nine sections present and non-empty', missingSections.length === 0, missingSections.join(', '));
check('character.json: id/name/source present', Boolean(character.id && character.name && character.source));
check('character.json: summary present', typeof character.summary === 'string' && character.summary.length > 40);
check('character.json: retrieval keeps the references placeholder',
  character.sections.retrieval.includes('{{REFERENCES_DIR}}'));
check('character.json: few-shot examples are short and well-formed',
  Array.isArray(character.fewShot) && character.fewShot.length >= 10 &&
    character.fewShot.every((item) => typeof item.situation === 'string' &&
      typeof item.line === 'string' && item.line.length <= 60));
check('character.json: conversation discipline forbids stage directions',
  character.sections.conversation.includes('不要描写任何动作'));
// 招牌台词的场合约束：防止「Rock 'n' roll！」再次变成通用句号。
check('character.json: closer lines are context-limited',
  character.sections.core.includes('只有战斗或演出收场') &&
    character.sections.speech.includes('不是每条回复的句号'));
check('character.json: speech pools carry usage labels',
  Object.keys(character.speechPools ?? {}).some((k) => k.includes('技术问答别用')) &&
    Object.keys(character.speechPools ?? {}).some((k) => k.includes('只在真正动手')));

// --------------------------------------------------------------------------
// generated plugin
// --------------------------------------------------------------------------
check('plugin index.js: named export apply()', /export function apply\(ctx, config\)/.test(index));
check('plugin index.js: named export renderCharacterPrompt()', /export function renderCharacterPrompt\(/.test(index));
check('plugin index.js: exports the character definition', /export const character = CHARACTER/.test(index));
check('plugin index.js: module tag matches the package name', index.includes(`@module ${pluginPkg.name}`));
check('plugin index.js: injects systemPrompt', index.includes("export const inject = ['systemPrompt']"));
check('plugin index.js: Config validates every documented field',
  configFields.every((field) => index.includes(`${field}: z.`)));
check('plugin index.js: every detail level is wired', detailLevels.every((level) => index.includes(`'${level}'`)));
check('plugin index.js: no generator markers left', !index.includes('@@'));
check('plugin index.js: references path resolved from import.meta.url',
  index.includes("new URL('./references/', import.meta.url)"));
check('plugin index.js: prompt interpolation is disabled', index.includes('interpolate: false'));
// Some upstream gateways fingerprint the stock harness-identity sentence and answer
// with a 400 that makes the client drop the whole system prompt; the plugin shadows
// that section so the persona still arrives.
check('plugin index.js: shadows harness:identity', index.includes("name: 'harness:identity'"));
check('plugin character.json copy matches the source',
  JSON.stringify(JSON.parse(await read('packages/plugin/character.json'))) === JSON.stringify(character));

// --------------------------------------------------------------------------
// generated skill
// --------------------------------------------------------------------------
const skillMd = await read('packages/skill/SKILL.md');
const frontmatter = skillMd.startsWith('---\n') ? skillMd.slice(4, skillMd.indexOf('\n---\n')) : '';
check('skill: SKILL.md opens with YAML frontmatter', frontmatter.length > 0);
check('skill: frontmatter is named hikari-rento', /^name: hikari-rento$/m.test(frontmatter));
check('skill: description is present and long enough', /^description: .{40,}$/m.test(frontmatter));
check('skill: description stays spoiler-free', !/宇宙决战|模拟世界|顶替|记忆抹消/.test(frontmatter));
check('skill: carries the translator credit', skillMd.includes('译者：明日风等'));
check('skill: routes to every reference file',
  ['guardrails.md', 'world-commons.md', 'team-abilities.md', 'persona.md'].every((f) => skillMd.includes(`references/${f}`)));
check('skill: tells the model to stay inside the skill directory', skillMd.includes('不要读技能目录以外'));
check('skill: no generator markers left', !skillMd.includes('@@'));
check('skill: no absolute Windows paths baked in', !/[A-Za-z]:\\\\/.test(skillMd));

// --------------------------------------------------------------------------
// copied reference files (both packages)
// --------------------------------------------------------------------------
for (const pkg of ['plugin', 'skill']) {
  const dir = fileURLToPath(new URL(`packages/${pkg}/references/`, ROOT));
  const names = (await readdir(dir)).filter((n) => n.endsWith('.md')).sort();
  check(`${pkg}: all five reference files copied`, names.length === 5, names.join(', '));
}
check('skill: NOTICE travels with it', (await read('packages/skill/NOTICE.md')).includes('译者：明日风等'));
check('skill: LICENSE travels with it', (await read('packages/skill/LICENSE')).includes('MIT License'));
check('plugin: NOTICE travels with it', (await read('packages/plugin/NOTICE.md')).includes('原作'));

// --------------------------------------------------------------------------
// docs and hygiene
// --------------------------------------------------------------------------
check('README.md documents every config field', configFields.every((field) => readme.includes(field)));
check('README.md links the licence', readme.includes('LICENSE'));
check('README.md presents both editions', readme.includes('hikari-rento-skill') && readme.includes('hikari-rento'));
for (const file of ['LICENSE', 'NOTICE.md', 'CHANGELOG.md', 'README.en.md', 'CONTRIBUTING.md',
  '.gitignore', 'docs/skill.md', 'docs/install.md', 'docs/architecture.md', 'docs/testing.md', 'docs/publishing.md']) {
  check(`${file} exists`, await exists(file));
}
check('LICENSE is MIT text', (await read('LICENSE')).includes('MIT License'));
check('NOTICE.md carries the fan-work disclaimer', (await read('NOTICE.md')).includes('原作'));
check('.gitignore ignores packaged artifacts', (await read('.gitignore')).includes('dist/'));
const iconStat = await stat(fileURLToPath(new URL('packages/plugin/icon.svg', ROOT)));
check('icon.svg is under the 256 KiB manifest limit', iconStat.size < 256 * 1024, `${iconStat.size} B`);

// --------------------------------------------------------------------------
// report
// --------------------------------------------------------------------------
const total = passed + failures.length;
if (failures.length > 0) {
  console.error(`\n${failures.length} of ${total} checks failed:\n`);
  for (const failure of failures) console.error(`  FAIL  ${failure}`);
  process.exit(1);
}
console.log(`all ${total} checks passed`);
