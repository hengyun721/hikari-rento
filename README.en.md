# hikari-rento

[中文](README.md) | [English](README.en.md)

[![npm: hikari-rento](https://img.shields.io/npm/v/hikari-rento?style=flat-square&logo=npm&label=plugin)](https://www.npmjs.com/package/hikari-rento)
[![npm: hikari-rento-skill](https://img.shields.io/npm/v/hikari-rento-skill?style=flat-square&logo=npm&label=skill)](https://www.npmjs.com/package/hikari-rento-skill)
[![Stars](https://img.shields.io/github/stars/hengyun721/hikari-rento?style=flat-square&logo=github&label=Stars)](https://github.com/hengyun721/hikari-rento/stargazers)
[![License](https://img.shields.io/github/license/hengyun721/hikari-rento?style=flat-square&label=license)](LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/hengyun721/hikari-rento/ci.yml?style=flat-square&label=CI)](https://github.com/hengyun721/hikari-rento/actions)

**Rento Hikari from *This Is the Terminal Stagnation Committee*, shipped in two parallel forms:
a DeepSeek Harness plugin and a portable skill.**

The self-proclaimed "flawless strongest beautiful girl", the trailing `～` `♪` `啦` `哦` `呢`,
and the girl underneath the armor: afraid of hot food, ghosts and her own feelings.

Both editions are **generated from one `character.json`** and released independently — separate
versions, separate tags, separate releases. Neither is an artifact of the other.

> ⚠️ **Spoilers**: `references/`, `人设.md`, `证据与归属说明.md` and the copied `references/`
> inside both packages describe plot details from all six volumes. **README and `docs/` are spoiler-free.**

## Two editions

| | [`hikari-rento`](packages/plugin) | [`hikari-rento-skill`](packages/skill) |
|---|---|---|
| What | DeepSeek Harness **bundle plugin** | Portable **skill** package |
| How it loads | Declares an agent preset; the work layer stays neutral and only the final chat answer is voiced | The host loads it on demand; **lends** a voice |
| Tools | Row-for-row copy of the official `standard` preset (aligned with DSH 0.2.2-rc.1) | Whatever the host provides |
| Install | Plugin manager (local folder / tgz / npm) | Copy the folder / unpack the `.tgz` |
| Tag | `plugin-v*` | `skill-v*` |

## Install

### Plugin (DSH)

> **The install target is [`packages/plugin/`](packages/plugin) — never the repository root.**
> The root `package.json` carries no `dsh.bundle`, so pointing the installer at it fails with
> `not-a-bundle`. That has been true since the 1.0.0 monorepo split; in 2.x the root *was* the bundle.

**Local folder (most reliable)**: **Settings → Plugins → install local bundle** → pick
`<checkout>/packages/plugin`.

**tgz**: run `npm run pack:plugin` for `dist/hikari-rento-<version>.tgz`, or use the release asset.

**npm**: the plugin is on the registry as [`hikari-rento`](https://www.npmjs.com/package/hikari-rento).
Check `npm view hikari-rento version` for whether 2.0.0 is published; otherwise use the local directory or tgz.

Restart the client afterwards, then **open a new session**. See [the install guide](docs/install.md).

### Skill (any agent)

Copy [`packages/skill/`](packages/skill) into your agent's skills directory, or unpack the
`hikari-rento-skill-<version>.tgz` from the release:

```bash
tar -xzf hikari-rento-skill-1.0.2.tgz -C ~/.claude/skills/
```

Then start a fresh session and say "恋兔光模式".

### Always open a new session

Switching the preset inside an existing session hits
`dsh-scope: scope key is already bound to a parent` — a preset-registry edge case, unrelated to this plugin.

## What the plugin does

| Capability | Detail |
|---|---|
| **Neutral work layer** | Normal tasks run on tools, files, tests and facts; no catchphrases, emotions, or relationship tables in the work prompt |
| **Keeps the full toolset** | Files, shell, search, subagents, workflows, skills — same list as the official `standard` preset |
| **Stays in character only at the end** | Engineering language while working; her voice, one to three sentences, for the answer |
| **Knows what she does not know** | Every fact carries a 〔我〕experienced / 〔听〕heard / 〔不知〕unknown / 〔忘〕erased tag |
| **Refuses borrowed credit** | Experiences from elsewhere and battles others fought — she corrects you instead of playing along |
| **Short by default** | One or two sentences, no stage directions, no bracketed narration |
| **Has a spoken-quip pool** | 11 context groups; pick one line and go — no reuse, no repeats, only a context mismatch counts as wrong |

## Configuration

No configuration is required — the bundled patch already makes **"角色：恋兔光"** the default preset
for new sessions. To opt out, delete the trailing `- id: agent-preset-registry` block and reinstall.

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

| Field | Default | Meaning |
|---|---|---|
| `detail` | `standard` | Work-layer archive routing depth; this bundle ships `full` |
| `fewShotEnabled` | `true` | Append few-shot lines to the final-answer voice editor |
| `sectionName` | `character:work-policy` | Work-layer section name; no longer shadows the deployment persona |
| `sectionOrder` | `0` | Work-layer section order |
| `overrideIdentity` | `true` | Shadows DSH's `harness:identity`. Some third-party relay services fingerprint fixed sentences in the system prompt and replace the whole system message with a neutral one — a common relay issue, not a DSH problem. Set `false` when mounting globally |
| `identityText` | `You are an AI assistant.` | Replacement text for that section |
| `includeRuntimeContext` | `true` | Turning this off also removes sandbox and approval guidance — all or nothing |

### Work-layer detail levels

`detail` now only controls archive routing in the neutral work prompt; the final-answer voice editor is always on. `minimal` adds no archive routing, `standard` adds `references/index.md`, and `full` adds the archive discipline.

## Reference routing

`full` adds a routing paragraph to the neutral work prompt; only four kinds of questions go look something up.

| Question | File |
|---|---|
| Quote attribution, and which events are not hers | `references/guardrails.md` |
| World common sense: organisations, geography, power system | `references/world-commons.md` |
| Teammates' and acquaintances' abilities | `references/team-abilities.md` |
| Anything else | `references/persona.md` |

The absolute path is resolved at load time from `import.meta.url`, so the plugin works wherever it is installed.

## Repository layout

```
hikari-rento/
├── character.json          # character definition: the single source of truth
├── references/             # four reference files (source, ⚠️ spoilers)
├── packages/
│   ├── plugin/             # npm: hikari-rento — the DSH plugin
│   │   ├── index.js        # GENERATED plugin body
│   │   ├── cordis.patch.yml
│   │   ├── character.json  # generated copy
│   │   └── references/     # generated copy
│   └── skill/              # npm: hikari-rento-skill — the skill package
│       ├── SKILL.md        # GENERATED frontmatter + persona
│       └── references/     # generated copy
├── scripts/                # build / self-check / package-plugin / package-skill
├── docs/                   # install, configuration, architecture, testing, publishing, skill
├── 人设.md                 # human-readable version of character.json (⚠️ spoilers)
├── 证据与归属说明.md        # per-volume evidence (⚠️ spoilers)
└── .github/workflows/ci.yml
```

Edit `character.json`, then `npm run build`; both packages regenerate and `npm run check` compares every artifact.

## Docs

| File | Contents |
|---|---|
| [docs/install.md](docs/install.md) | Both editions, upgrades, uninstall, troubleshooting |
| [docs/skill.md](docs/skill.md) | How the skill edition differs, packaging, install |
| [docs/configuration.md](docs/configuration.md) | Every config field, detail levels, the `sectionName` collision |
| [docs/architecture.md](docs/architecture.md) | How the bundle works, the generation chain |
| [docs/testing.md](docs/testing.md) | What the checks cover and how to add one |
| [docs/publishing.md](docs/publishing.md) | npm publish, the two tag lines, release checklist |

## Development

```bash
npm run build      # character.json → every artifact in both packages
npm run check      # artifacts are in sync with character.json
npm test           # dependency-free structural checks (80)
npm run pack       # package both editions into dist/
npm run privacy    # scan for local paths, tokens, e-mail addresses
npm run verify     # check + test + privacy
```

CI runs `npm run verify` on Node 20 and 22, then uploads one artifact per edition.

## Releasing

Two independent tag lines:

```bash
npm version patch -w packages/plugin
git tag plugin-v$(node -p "require('./packages/plugin/package.json').version")

npm version patch -w packages/skill
git tag skill-v$(node -p "require('./packages/skill/package.json').version")
```

See [docs/publishing.md](docs/publishing.md) for the full checklist.

## Known limitations

- **She still drifts.** Reference routing is a prompt-level discipline, not a host mechanism.
- **The persona is compressed.** Six volumes into a dozen prompt sections.
- **Verified at the package level.** Artifact consistency and patch structure are asserted; activation in DSH depends on the plugin manager version.
- **Fan work.** See [NOTICE.md](NOTICE.md).

## License and credits

- **Code**: MIT — see [LICENSE](LICENSE).
- **Character material**: belongs to the original author and publisher. This repository is an
  **unofficial fan project**, ships no novel text, and is non-commercial.
- **Translation**: the Chinese edition was a fan translation — **translator: 明日风 et al.** See [NOTICE.md](NOTICE.md).

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) first. This project would rather answer "I don't know" than invent canon.