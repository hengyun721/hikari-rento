#!/usr/bin/env node
/**
 * Portable skill checks: generated metadata, shared references, platform docs,
 * and no plugin-only claims in SKILL.md.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, root), 'utf8');
const pkg = JSON.parse(read('packages/skill/package.json'));
const skill = read('packages/skill/SKILL.md');
const readme = read('packages/skill/README.md');

assert.equal(pkg.version, '1.1.0');
assert.ok(skill.startsWith('---\nname: hikari-rento\n'));
assert.ok(skill.includes('最终回答协议'));
assert.ok(skill.includes('技术场景示例'));
assert.ok(skill.includes('她是终末'));
assert.ok(skill.includes('不要反推成「不是」') || skill.includes('不许反推成「不是」'));
assert.ok(!skill.includes('DSH_HIKARI_DEBUG'));
assert.ok(!skill.includes('llm/stream'));
assert.ok(readme.includes('Claude Code'));
assert.ok(readme.includes('Codex'));
assert.ok(readme.includes('能力边界'));

for (const name of readdirSync(new URL('references/', root))) {
  if (!name.endsWith('.md')) continue;
  assert.equal(
    read(`packages/skill/references/${name}`),
    read(`references/${name}`),
    `skill reference out of sync: ${name}`
  );
}

console.log('skill checks passed');
