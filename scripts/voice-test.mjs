#!/usr/bin/env node
/**
 * Dependency-free checks for the final-answer voice layer.
 *
 *     node scripts/voice-test.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// CI 故意不装依赖；把 schemastery 换成最小 stub，避免测试去解析 DSH 的包。
const pluginSource = readFileSync(new URL('../packages/plugin/index.js', import.meta.url), 'utf8')
  .replace("import z from '@deepseek-ai/schemastery';", [
    'const z = {',
    '  object: (schema) => schema,',
    '  union: () => ({ default: (value) => value }),',
    '  boolean: () => ({ default: (value) => value }),',
    '  string: () => ({ default: (value) => value }),',
    '  number: () => ({ default: (value) => value })',
    '};'
  ].join('\n'))
  .replace("import { fileURLToPath } from 'node:url';", '')
  .replace("const REFERENCES_DIR = fileURLToPath(new URL('./references/', import.meta.url));", "const REFERENCES_DIR = 'references/';");
const plugin = await import(`data:text/javascript;base64,${Buffer.from(pluginSource).toString('base64')}`);
const { apply, voice } = plugin;

const original = [
  '已完成。修改了 3 个文件：`src/a.js`、`src/b.ts`，并运行 `npm test`。',
  '',
  '结果：测试通过，剩余风险为 0。',
  '',
  '```js',
  'const answer = 42;',
  '```'
].join('\n');

const protectedData = voice.protectText(original);
assert.equal(voice.restoreText(protectedData.text, protectedData), original);
assert.ok(!protectedData.text.includes('src/a.js'));
assert.ok(protectedData.text.includes('⟦P0⟧'));

const rewritten = protectedData.text
  .replace('已完成。', '搞定了。')
  .replace('结果：测试通过，剩余风险为 0。', '结果：测试过了，风险为零。');
const restored = voice.restoreText(rewritten, protectedData);
assert.ok(restored);
assert.equal(voice.validateRewrite(original, restored), true);
assert.ok(restored.includes('src/a.js'));
assert.ok(restored.includes('const answer = 42;'));

const changedNumber = restored.replace('3', '4');
assert.equal(voice.validateRewrite(original, changedNumber), false);

const lostPlaceholder = rewritten.replace('⟦P0⟧', '');
assert.equal(voice.restoreText(lostPlaceholder, protectedData), null);

const newNumber = `${restored}\n另外还有 99 个问题。`;
assert.equal(voice.validateRewrite(original, newNumber), false);

const newCode = `${restored}\n\`\`\`js\nconst extra = 1;\n\`\`\``;
assert.equal(voice.validateRewrite(original, newCode), false);

const work = voice.renderWorkPolicy('full');
assert.ok(work.includes('中立的工程助手'));
assert.ok(work.includes('index.md'));
assert.ok(!work.includes('口头池'));
assert.ok(!work.includes('本恋兔光大人'));

const editor = voice.buildEditorRequest(original, true);
assert.ok(editor.system.includes('文风编辑'));
assert.ok(editor.system.includes('恋兔光'));
assert.ok(editor.user.includes('⟦P0⟧'));

async function* textStream() {
  yield { type: 'block-start', index: 0, blockType: 'text' };
  yield { type: 'text-delta', index: 0, text: '已完成。' };
  yield { type: 'block-end', index: 0, block: { type: 'text', text: '已完成。' } };
  yield { type: 'usage', usage: {} };
  yield { type: 'finish', reason: { kind: 'stop' } };
}

const editedContext = {
  llm: {
    calls: 0,
    async *stream() {
      this.calls += 1;
      if (this.calls === 1) {
        yield { type: 'text-delta', index: 0, text: '搞定了。' };
      } else {
        yield { type: 'text-delta', index: 0, text: 'PASS' };
      }
      yield { type: 'finish', reason: { kind: 'stop' } };
    }
  }
};

const emitted = [];
for await (const chunk of voice.wrapFinalAnswer(editedContext, { sessionId: 's1' }, textStream)) {
  emitted.push(chunk);
}
assert.ok(emitted.some((chunk) => chunk.type === 'text-delta' && chunk.text === '搞定了。'));
assert.equal(emitted.at(-1).type, 'finish');

async function* toolStream() {
  yield { type: 'text-delta', index: 0, text: '先查一下。' };
  yield { type: 'tool-call-delta', index: 1, id: 't1', argumentsDelta: '{}' };
  yield { type: 'finish', reason: { kind: 'tool-calls' } };
}

const passthrough = [];
for await (const chunk of voice.wrapFinalAnswer(
  { llm: { async *stream() { throw new Error('editor must not run for tool steps'); } } },
  { sessionId: 's1' },
  toolStream
)) {
  passthrough.push(chunk);
}
assert.ok(passthrough.some((chunk) => chunk.type === 'tool-call-delta'));
assert.ok(passthrough.some((chunk) => chunk.type === 'text-delta' && chunk.text === '先查一下。'));

const subagent = [];
for await (const chunk of voice.wrapFinalAnswer(
  { agents: { roots: () => [{ id: 'root' }] }, llm: { async *stream() { throw new Error('editor must not run for subagents'); } } },
  { sessionId: 'child' },
  textStream
)) {
  subagent.push(chunk);
}
assert.ok(subagent.some((chunk) => chunk.type === 'text-delta' && chunk.text === '已完成。'));

const verifierCtx = {
  llm: {
    async *stream() {
      yield { type: 'text-delta', index: 0, text: 'PASS' };
      yield { type: 'finish', reason: { kind: 'stop' } };
    }
  }
};
assert.equal(await voice.verifyRewrite(verifierCtx, {}, '原文', '改写'), true);
assert.equal(await voice.verifyRewrite(
  { llm: { async *stream() { yield { type: 'text-delta', index: 0, text: 'FAIL' }; yield { type: 'finish', reason: { kind: 'stop' } }; } } },
  {},
  '原文',
  '改写'
), false);

const sections = [];
const listeners = [];
const mockCtx = {
  systemPrompt: {
    getSectionOrder: () => -1000,
    section: (value) => {
      sections.push(value);
      return () => {};
    },
    suppressRuntimeContext: () => {}
  },
  effect: (factory) => factory(),
  on: (event, listener) => {
    listeners.push({ event, listener });
    return () => {};
  }
};
apply(mockCtx, { detail: 'full', fewShotEnabled: true, overrideIdentity: true });
assert.ok(sections.some((section) => section.name === 'harness:identity'));
assert.ok(sections.some((section) => section.name === 'character:work-policy'));
assert.ok(!sections.some((section) => section.name === 'deployment:persona-prefix'));
assert.ok(sections.find((section) => section.name === 'character:work-policy').text.includes('中立的工程助手'));
assert.ok(listeners.some(({ event }) => event === 'llm/stream'));

const structuredText = [
  '【正文】',
  '条例第 3 条：测试通过。',
  '【吐槽】',
  '这条条例好长。'
].join('\n');
const split = voice.splitFinalAnswer(structuredText);
assert.equal(split.objective, '条例第 3 条：测试通过。');
assert.equal(split.commentary, '这条条例好长。');
assert.ok(voice.renderWorkPolicy('full').includes('【正文】'));
assert.ok(voice.renderWorkPolicy('full').includes('【吐槽】'));

const commentaryContext = {
  llm: {
    async *stream() {
      yield { type: 'text-delta', index: 0, text: '这条例真长～' };
      yield { type: 'finish', reason: { kind: 'stop' } };
    }
  }
};
const structuredChunks = [];
for await (const chunk of voice.wrapFinalAnswer(
  commentaryContext,
  { sessionId: 's1' },
  async function* () {
    yield { type: 'block-start', index: 0, blockType: 'text' };
    yield { type: 'text-delta', index: 0, text: structuredText };
    yield { type: 'block-end', index: 0, block: { type: 'text', text: structuredText } };
    yield { type: 'finish', reason: { kind: 'stop' } };
  }
)) {
  structuredChunks.push(chunk);
}
const structuredOutput = structuredChunks.find((chunk) => chunk.type === 'text-delta')?.text;
assert.ok(structuredOutput.includes('条例第 3 条：测试通过。'));
assert.ok(structuredOutput.includes('这条例真长～'));
assert.ok(!structuredOutput.includes('【正文】'));
assert.ok(!structuredOutput.includes('【吐槽】'));

console.log('voice checks passed');
