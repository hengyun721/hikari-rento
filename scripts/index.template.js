/**
 * 恋兔光（《这里是，终末停滞委员会。》）角色模仿插件 —— Host 半边。
 *
 * 2.0 起分成两层：
 *   1. 工作层：system prompt 只放中立工程策略和「何时查档案」的路由，
 *      不把口癖、情绪、关系表塞进工作过程。
 *   2. 最终回答层：监听 `llm/stream`，只对「没有工具调用、只有文本」的最终回答
 *      做一次文风编辑；工具参数、文件内容、中间进度都不经过这一层。
 *
 * 文风编辑不是开关：只要插件在，最终回答就会尝试改写；编辑失败或事实校验
 * 不通过时回退原文，准确性优先。没有「要不要人设」的用户配置。
 *
 * 角色定义内嵌在本文件里（由 character.json 生成），因此插件不读取任何运行时文件、
 * 不依赖任何包，除 `@deepseek-ai/schemastery` 的 Config 校验外没有第三方依赖。
 *
 * 唯一的运行时 IO 是「档案目录」的路径（references/）：工作层会告诉模型在哪四类
 * 问题上该去读哪一份参考档；路径由 import.meta.url 在加载时算出来，所以插件装到
 * 哪个目录都成立。
 *
 * @module @@PACKAGE@@
 */
import z from '@deepseek-ai/schemastery';
import { fileURLToPath } from 'node:url';

/** Cordis 插件名。 */
export const name = 'character-hikari-rento';

/** 系统提示词 + 最终回答编辑 + 根会话判定。 */
export const inject = ['systemPrompt', 'llm', 'agents'];

/** 角色定义（由 character.json 生成，勿手改；改 character.json 后重新生成）。 */
const CHARACTER = @@CHARACTER@@;

/** 详细度预设 → 段落清单（保留给 renderCharacterPrompt 兼容使用）。 */
const DETAIL_SECTIONS = @@DETAIL@@;

/** 少样本示例。 */
const FEW_SHOT = @@FEWSHOT@@;

const TECH_FEW_SHOT = [
  {
    situation: '故障复盘开场',
    line: '行，本恋兔光大人看完了。结论先说：不是下游挂了，是网关自己没接上。'
  },
  {
    situation: '技术状态中段',
    line: '这流水线漏得跟没戴手套接球一样——缓存键不看源码，构建失败还被 || true 吞了。'
  },
  {
    situation: '技术回答收尾',
    line: '别把运气当成本事啦。下次再让旧产物混上线，我可真要生气了哦。'
  }
];

/** 参考档案目录（references/）的绝对路径，随插件安装位置自动解析。 */
const REFERENCES_DIR = fileURLToPath(new URL('./references/', import.meta.url));

/** 只在排查时输出结构化失败原因；不打印正文。 */
const DEBUG = typeof process !== 'undefined' && process.env.DSH_HIKARI_DEBUG === '1';

function debugLog(ctx, message, data) {
  if (!DEBUG) return;
  const suffix = data === undefined ? '' : ` ${JSON.stringify(data)}`;
  const line = `[hikari-rento] ${message}${suffix}`;
  try {
    if (typeof ctx?.logger?.warn === 'function') ctx.logger.warn(line);
    else console.warn(line);
  } catch {}
}

function fail(ctx, reason, data) {
  debugLog(ctx, `voice fallback: ${reason}`, data);
  return null;
}

/** 工作层：默认中立，不把角色口吻带进工作过程。 */
const WORK_POLICY = [
  '你是一个中立的工程助手。默认按工具、文件、测试结果和事实工作。',
  '工作过程（工具参数、文件内容、命令、代码、中间进度）不要使用恋兔光（恋兎ヒカリ）的口吻，也不要提及她。',
  '只有当用户明确询问恋兔光／《这里是，终末停滞委员会。》的角色、世界观、经历或关系时，才读取档案：{{REFERENCES_DIR}}index.md 和命中的参考档，按档案回答；查不到就说“不知道”，不要编。',
  '被问“你是谁”时，回答你是恋兔光（恋兎ヒカリ），其他细节按档案。',
  '最终聊天回答（包括普通任务和技术问答）会由独立文风层统一转换成她的口吻；你不需要在生成阶段模仿她。'
].join('\n');

const REFERENCE_GUIDE = [
  '【档案路由】',
  '档案目录：{{REFERENCES_DIR}}index.md。',
  '只在人物、世界观、经历、关系或能力边界的问题上使用；普通工作任务不要打开档案。',
  '先读 index.md 定位，只读命中的那一节，不要整份吞。'
].join('\n');

const FULL_REFERENCE_RULES = [
  '【档案纪律】',
  '标签压过档案：人设里标着〔不知〕的，即使档案里有旁证也不许说。',
  '没在场的事绝不说“我打过”“我去过”“我记得”；只答自己半径内那一截，其余划出去。',
  '查不到就直说不知道，不解释、不猜、不补设定。'
].join('\n');

/**
 * 把工作层策略渲染成系统提示词文本。
 * @param detail - minimal 只给核心策略；standard 加档案路由；full 再加档案纪律。
 * @param referencesDir - 参考档案目录的绝对路径。
 * @returns 工作层提示词。
 */
export function renderWorkPolicy(detail, referencesDir = REFERENCES_DIR) {
  const level = detail === 'minimal' || detail === 'full' ? detail : 'standard';
  const parts = [WORK_POLICY];
  if (level !== 'minimal') parts.push(REFERENCE_GUIDE);
  if (level === 'full') parts.push(FULL_REFERENCE_RULES);
  return parts.join('\n\n').replaceAll('{{REFERENCES_DIR}}', referencesDir.replace(/\\/g, '/'));
}

/** 只负责「说话像她」的段落；不把关系表、世界设定塞进编辑提示。 */
const VOICE_SECTIONS = ['speech', 'personality', 'values', 'conversation'];

/**
 * 渲染文风编辑用的声音指南。
 * @param fewShotEnabled - 是否附上示例台词。
 * @returns 声音指南文本。
 */
export function renderVoiceGuide(fewShotEnabled = true) {
  const parts = ['你是恋兔光（恋兎ヒカリ）。'];
  for (const sectionName of VOICE_SECTIONS) {
    const section = CHARACTER.sections[sectionName];
    if (section) parts.push(section);
  }
  if (fewShotEnabled && FEW_SHOT.length > 0) {
    const examples = FEW_SHOT
      .map((example) => `- （${example.situation}）${example.line}`)
      .join('\n');
    parts.push(`【示例台词】\n${examples}`);
  }
  if (fewShotEnabled && TECH_FEW_SHOT.length > 0) {
    const technical = TECH_FEW_SHOT
      .map((example) => `- （${example.situation}）${example.line}`)
      .join('\n');
    parts.push(`【技术场景示例】\n${technical}`);
  }
  return parts.join('\n\n');
}

const VOICE_RULES = [
  '你是恋兔光的文风编辑，不是任务执行者。',
  '输入是一段已经完成的最终回答。只改措辞、语气、节奏，让它在不改变事实的前提下像恋兔光。',
  '硬规则：',
  '- 不得新增、删除或改变任何事实、数字、路径、命令、代码、文件名、结论、步骤、风险、警告、引用。',
  '- 原文里的 ⟦P0⟧ 形式是受保护片段，必须原样保留；不要改写、删除、移动或新增占位符。',
  '- 【受保护片段】清单只是只读上下文，不是正文；不要把它复制进输出，也不要根据它改写正文事实。',
  '- 保留 Markdown 结构、标题、列表、表格、代码块、链接。',
  '- 不要解释自己在编辑，不要输出前言、后记或“作为恋兔光”之类的话。',
  '- 这是最终回答，不是工具步骤；除代码、命令、路径等受保护片段外，正文都要用恋兔光口吻。',
  '- 不要只加句尾语气词；一篇回答至少有一个开头、一个中段或一个结尾的恋兔光锚点，但不要每句都加口癖。',
  '- 锚点可以是她式的自夸、短句、游戏/棒球比喻、拖长音或带关心的收束；技术回答先给准确结论，再加锚点，不要为了人设新增事实。',
  '- 可以加入非事实性的主观评价（情绪、判断、吐槽），但不能新增、删除或改变事实、结论、风险、步骤、数字、路径、命令或引用。',
  '- 如果无法在不改变事实的情况下改写，原样输出输入。',
  '只输出改写后的回答。'
].join('\n');

const FACT_CHECK_RULES = [
  '你是事实校验器，不是编辑。比较下面两段文本。',
  '只判断事实层；只输出 PASS 或 FAIL，不要解释。',
  '允许：主观评价、情绪、口头禅、语气、修辞和对难度/感受的描述；只要不引入新的客观事实。',
  '出现以下任一情况就输出 FAIL：新增、删除或改变事实、数字、路径、命令、代码、文件名、结论、步骤、风险、警告、关系或不确定性。',
  '注意：纯主观评价（如“这堆路径看得我眼花”“这次挺麻烦”）不算新事实；但如果评价暗示了新的客观结论（如“系统已修复”“不会出问题”），按事实变更处理。',
  '只有事实层完全一致时才输出 PASS。'
].join('\n');

const POLISH_RULES = [
  '你是恋兔光的文风收尾编辑。输入是一篇已经改写过的最终回答。',
  '只做轻量收尾：最多调整开头一句、结尾一句和重复的过渡；补一到两个恋兔光锚点。',
  '不要重写正文，不要改变任何事实、数字、路径、命令、代码、文件名、结论、步骤、风险、警告、引用。',
  '不要只加句尾语气词；但也不要每句都加口癖，锚点要自然。',
  '原文里的 ⟦P0⟧ 形式是受保护片段，必须原样保留；不要复制、改写、移动或新增占位符。',
  '保留 Markdown 结构、标题、列表、表格、代码块、链接。',
  '如果无法在不改变事实的情况下收尾，原样输出输入。',
  '只输出收尾后的回答。'
].join('\n');

/**
 * 把最终回答里的事实性片段替换成占位符，避免编辑模型碰它们。
 * @param text - 原始最终回答。
 * @returns 占位符文本、受保护片段与占位符前缀。
 */
export function protectText(text) {
  let tag = '⟦P';
  while (text.includes(tag)) tag += 'Q';
  const patterns = [
    { kind: 'code', re: /```[\s\S]*?```/g },
    { kind: 'inline-code', re: /`[^`\n]+`/g },
    { kind: 'link', re: /!?\[[^\]\n]*\]\([^)\n]+\)/g },
    { kind: 'url', re: /https?:\/\/[^\s<>"'）)]+/g },
    { kind: 'email', re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
    { kind: 'ip', re: /\b\d{1,3}(?:\.\d{1,3}){3}\b/g },
    { kind: 'path', re: /[A-Za-z]:[\\/][^\s，。；：、）)]+/g },
    { kind: 'path', re: /\\\\[^\s，。；：、）)]+/g },
    { kind: 'path', re: /(?:~|\.{1,2})?\/[^\s，。；：、）)]+/g },
    { kind: 'html-table', re: /<table[\s\S]*?<\/table>/gi },
    { kind: 'table', re: /(?:^|\n)(?:[ \t]*\|.*\|[ \t]*(?:\n|$))+/g },
    { kind: 'filename', re: /\b[\w.-]+\.(?:md|json|jsonl|js|mjs|cjs|ts|tsx|jsx|py|go|rs|java|c|cc|cpp|h|hpp|cs|exe|zip|tar|gz|png|jpe?g|webp|svg|yaml|yml|toml|txt|csv|xlsx|docx|pdf|html?|css|scss|vue|svelte|sql|db|sqlite|ipynb|env|log|ini|cfg|xml)\b/gi },
    { kind: 'secret', re: /\b(?:sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16})\b/g },
    { kind: 'secret', re: /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/g },
    { kind: 'math', re: /\$\$[\s\S]*?\$\$|\$[^$\n]+\$/g },
    { kind: 'label', re: /(?:第|图|表|式|页|章|节)\s*\d+(?:\.\d+)?/g },
    { kind: 'quantity', re: /\b\d+(?:\.\d+)?\s*(?:%|‰|°C|℃|V|mV|uV|A|mA|uA|Ω|kΩ|MΩ|Hz|kHz|MHz|GHz|s|ms|us|ns|mm|cm|km|m|g|kg|mg|dB|bit|Byte|B|KB|MB|GB|TB|W|kW|mW|F|uF|nF|pF|H|mH|uH|rpm|r\/min)\b/gi },
    { kind: 'date', re: /\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b/g },
    { kind: 'time', re: /\b\d{1,2}:\d{2}(?::\d{2})?\b/g }
  ];
  const ranges = [];
  for (const { kind, re } of patterns) {
    for (const match of text.matchAll(re)) {
      ranges.push({ start: match.index, end: match.index + match[0].length, kind });
    }
  }
  ranges.sort((a, b) => a.start - b.start || a.end - b.end);
  const spans = [];
  const entries = [];
  let out = '';
  let cursor = 0;
  for (const { start, end, kind } of ranges) {
    if (start < cursor) continue;
    const value = text.slice(start, end);
    const index = spans.length;
    out += text.slice(cursor, start) + `${tag}${index}⟧`;
    spans.push(value);
    entries.push({ index, kind, text: value });
    cursor = end;
  }
  out += text.slice(cursor);
  return { text: out, spans, entries, tag };
}

/**
 * 还原受保护片段。
 * @param text - 编辑后的占位符文本。
 * @param protectedData - protectText() 的返回值。
 * @returns 还原后的文本；占位符缺失或重复时返回 null。
 */
export function restoreText(text, protectedData) {
  const { spans, tag } = protectedData;
  const re = new RegExp(`${escapeRegExp(tag)}(\\d+)⟧`, 'g');
  const seen = new Set();
  let out = '';
  let cursor = 0;
  for (const match of text.matchAll(re)) {
    const index = Number(match[1]);
    if (!Number.isInteger(index) || index < 0 || index >= spans.length || seen.has(index)) return null;
    seen.add(index);
    out += text.slice(cursor, match.index) + spans[index];
    cursor = match.index + match[0].length;
  }
  if (seen.size !== spans.length) return null;
  return out + text.slice(cursor);
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function countNumbers(text) {
  const counts = new Map();
  for (const match of text.matchAll(/\b\d+(?:\.\d+)?%?\b/g)) {
    counts.set(match[0], (counts.get(match[0]) || 0) + 1);
  }
  return counts;
}

function countOccurrences(text, needle) {
  if (!needle) return 0;
  let count = 0;
  let cursor = 0;
  while (true) {
    const found = text.indexOf(needle, cursor);
    if (found < 0) return count;
    count += 1;
    cursor = found + needle.length;
  }
}

/**
 * 校验编辑结果：受保护片段已还原，长度没有离谱，且没有新增数字。
 * @param original - 原始回答。
 * @param rewritten - 还原后的改写。
 * @returns 是否接受。
 */
export function validateRewrite(original, rewritten) {
  if (typeof rewritten !== 'string' || !rewritten.trim()) return false;
  const ratio = rewritten.length / Math.max(1, original.length);
  if (ratio < 0.4 || ratio > 2.5) return false;
  const before = countNumbers(original);
  const after = countNumbers(rewritten);
  if (before.size !== after.size) return false;
  for (const [value, count] of before) {
    if (after.get(value) !== count) return false;
  }
  if ((original.match(/```/g)?.length ?? 0) !== (rewritten.match(/```/g)?.length ?? 0)) return false;
  return true;
}

/**
 * 按段落/代码块切分最终回答；每段不超过 maxLen，避免一处失败拖垮整条回答。
 * @param text - 最终回答。
 * @param maxLen - 单段目标长度。
 * @returns 段落数组。
 */
export function splitSegments(text, maxLen = 1500) {
  if (text.length <= maxLen) return [text];
  const blocks = [];
  let buffer = [];
  let inCode = false;
  const flush = () => {
    if (buffer.length > 0) {
      blocks.push(buffer.join('\n'));
      buffer = [];
    }
  };
  for (const line of text.split('\n')) {
    if (/^\s*```/.test(line)) inCode = !inCode;
    if (!inCode && line.trim() === '') flush();
    else buffer.push(line);
  }
  flush();

  const parts = [];
  for (const block of blocks) {
    const blockLines = block.split('\n');
    const atomic = blockLines.some((line) => /^\s*```/.test(line) ||
      /^\s*\|.*\|\s*$/.test(line) ||
      /^\s*>\s?/.test(line) ||
      /^\s*(?:[-*+]|\d+[.)])\s+/.test(line));
    if (atomic || block.length <= maxLen) {
      parts.push(block);
      continue;
    }
    // 普通段落按中文句末切，避免把表格/列表/代码从中间切开。
    const sentences = block.match(/[^。！？!?；;\n]+[。！？!?；;]?/g) ?? [block];
    let chunk = '';
    for (const sentence of sentences) {
      if (chunk && chunk.length + sentence.length > maxLen) {
        parts.push(chunk);
        chunk = '';
      }
      chunk += sentence;
    }
    if (chunk) parts.push(chunk);
  }

  const merged = [];
  let current = '';
  for (const part of parts) {
    if (current && current.length + part.length + 2 > maxLen) {
      merged.push(current);
      current = part;
    } else {
      current = current ? `${current}\n\n${part}` : part;
    }
  }
  if (current) merged.push(current);
  return merged.length > 0 ? merged : [text];
}

/**
 * 给编辑模型一份只读的受保护片段清单，让它知道被藏起来的是什么，但不能改写。
 * @param protectedData - protectText() 的返回值。
 * @param maxChars - 清单总长度上限。
 * @returns 只读上下文文本。
 */
export function renderProtectedContext(protectedData, maxChars = 3000) {
  const entries = protectedData.entries ?? [];
  if (entries.length === 0) return '';
  const lines = ['【受保护片段（只读上下文，不是正文；禁止改写、复制或移动占位符）】'];
  let used = 0;
  for (const entry of entries) {
    let content = entry.text;
    if (entry.kind === 'code' || entry.kind === 'table' || entry.kind === 'html-table') {
      const limit = entry.kind === 'code' ? 500 : 1800;
      if (content.length > limit) content = `${content.slice(0, limit)}\n…（已截断，共 ${entry.text.length} 字）`;
    }
    const block = `⟦P${entry.index}⟧ 类型：${entry.kind}\n${content}`;
    if (used + block.length > maxChars) {
      lines.push(`…还有 ${entries.length - entry.index} 个受保护片段未展开`);
      break;
    }
    lines.push(block);
    used += block.length;
  }
  return lines.join('\n\n');
}

/**
 * 生成文风编辑请求。
 * @param original - 原始最终回答。
 * @param fewShotEnabled - 是否附示例台词。
 * @returns system、user、受保护片段。
 */
export function buildEditorRequest(original, fewShotEnabled = true) {
  const protectedData = protectText(original);
  const context = renderProtectedContext(protectedData);
  return {
    system: `${VOICE_RULES}\n\n【恋兔光的声音】\n\n${renderVoiceGuide(fewShotEnabled)}`,
    user: `【最终回答】\n${protectedData.text}${context ? `\n\n${context}` : ''}`,
    protectedData
  };
}

async function verifyRewrite(ctx, options, original, rewritten) {
  if (typeof ctx.llm?.stream !== 'function') return false;
  let raw = '';
  try {
    for await (const chunk of ctx.llm.stream({
      provider: options.provider,
      model: options.model,
      system: FACT_CHECK_RULES,
      messages: [{
        role: 'user',
        content: [{ type: 'text', text: `【原文】\n${original}\n\n【改写】\n${rewritten}` }]
      }],
      maxTokens: 4096,
      signal: options.signal
    })) {
      if (chunk.type === 'tool-call-delta') return false;
      if (chunk.type === 'text-delta') raw += chunk.text;
      if (chunk.type === 'finish') {
        if (chunk.reason?.kind !== 'stop') return false;
        break;
      }
    }
  } catch (error) {
    debugLog(ctx, 'fact check threw', { error: String(error) });
    return false;
  }
  const passed = /^\s*PASS\b/i.test(raw.trim());
  if (!passed) debugLog(ctx, 'fact check rejected', { responseLength: raw.length });
  return passed;
}

async function editFinalAnswer(ctx, options, original, fewShotEnabled) {
  if (typeof ctx.llm?.stream !== 'function') return fail(ctx, 'llm service unavailable');
  const { system, user, protectedData } = buildEditorRequest(original, fewShotEnabled);
  const meta = { chars: original.length, placeholders: protectedData.spans.length };
  let raw = '';
  let sawDelta = false;
  try {
    for await (const chunk of ctx.llm.stream({
      provider: options.provider,
      model: options.model,
      system,
      messages: [{ role: 'user', content: [{ type: 'text', text: user }] }],
      maxTokens: 16384,
      signal: options.signal
    })) {
      if (chunk.type === 'tool-call-delta') return fail(ctx, 'editor returned a tool call', meta);
      if (chunk.type === 'text-delta') {
        raw += chunk.text;
        sawDelta = true;
      }
      if (chunk.type === 'block-end' && !sawDelta && chunk.block?.type === 'text') {
        raw += chunk.block.text ?? '';
      }
      if (chunk.type === 'finish') {
        if (chunk.reason?.kind !== 'stop') return fail(ctx, 'editor finish was not stop', { ...meta, reason: chunk.reason?.kind });
        break;
      }
    }
  } catch (error) {
    return fail(ctx, 'editor threw', { ...meta, error: String(error) });
  }
  const restored = restoreText(raw.trim(), protectedData);
  if (restored === null) return fail(ctx, 'placeholder restore failed', meta);
  for (const entry of protectedData.entries ?? []) {
    if (entry.text.length < 12) continue;
    if (countOccurrences(restored, entry.text) > countOccurrences(original, entry.text)) {
      return fail(ctx, 'protected content duplicated outside placeholder', { ...meta, kind: entry.kind });
    }
  }
  if (!validateRewrite(original, restored)) {
    return fail(ctx, 'local validation failed', { ...meta, outputChars: restored.length });
  }
  if (!(await verifyRewrite(ctx, options, original, restored))) {
    return fail(ctx, 'fact check failed', meta);
  }
  debugLog(ctx, 'voice rewrite accepted', meta);
  return restored;
}

function isRootSession(ctx, sessionId) {
  const agents = ctx.agents;
  if (!agents || typeof agents.roots !== 'function') return true;
  try {
    const roots = agents.roots();
    if (!Array.isArray(roots) || roots.length === 0) return true;
    return roots.some((agent) => agent?.id === sessionId || agent?.session?.id === sessionId);
  } catch {
    return true;
  }
}

function isTextChunk(chunk) {
  return (chunk.type === 'block-start' && chunk.blockType === 'text') ||
    chunk.type === 'text-delta' ||
    (chunk.type === 'block-end' && chunk.block?.type === 'text');
}

function isToolChunk(chunk) {
  return chunk.type === 'tool-call-delta' ||
    (chunk.type === 'block-start' && chunk.blockType === 'tool-call');
}

async function polishAnswer(ctx, options, original, fewShotEnabled) {
  if (typeof ctx.llm?.stream !== 'function') return null;
  const protectedData = protectText(original);
  const context = renderProtectedContext(protectedData);
  const meta = { chars: original.length, placeholders: protectedData.spans.length };
  let raw = '';
  let sawDelta = false;
  try {
    for await (const chunk of ctx.llm.stream({
      provider: options.provider,
      model: options.model,
      system: `${POLISH_RULES}\n\n【恋兔光的声音】\n\n${renderVoiceGuide(fewShotEnabled)}`,
      messages: [{
        role: 'user',
        content: [{
          type: 'text',
          text: `【已改写回答】\n${protectedData.text}${context ? `\n\n${context}` : ''}`
        }]
      }],
      maxTokens: 16384,
      signal: options.signal
    })) {
      if (chunk.type === 'tool-call-delta') return fail(ctx, 'polish returned a tool call', meta);
      if (chunk.type === 'text-delta') {
        raw += chunk.text;
        sawDelta = true;
      }
      if (chunk.type === 'block-end' && !sawDelta && chunk.block?.type === 'text') {
        raw += chunk.block.text ?? '';
      }
      if (chunk.type === 'finish') {
        if (chunk.reason?.kind !== 'stop') return fail(ctx, 'polish finish was not stop', { ...meta, reason: chunk.reason?.kind });
        break;
      }
    }
  } catch (error) {
    return fail(ctx, 'polish threw', { ...meta, error: String(error) });
  }
  const restored = restoreText(raw.trim(), protectedData);
  if (restored === null) return fail(ctx, 'polish placeholder restore failed', meta);
  for (const entry of protectedData.entries ?? []) {
    if (entry.text.length < 12) continue;
    if (countOccurrences(restored, entry.text) > countOccurrences(original, entry.text)) {
      return fail(ctx, 'polish protected content duplicated', { ...meta, kind: entry.kind });
    }
  }
  if (!validateRewrite(original, restored)) return fail(ctx, 'polish local validation failed', meta);
  if (!(await verifyRewrite(ctx, options, original, restored))) {
    return fail(ctx, 'polish fact check failed', meta);
  }
  debugLog(ctx, 'voice polish accepted', meta);
  return restored;
}

async function* rewriteTextBlock(ctx, options, record, fewShotEnabled, polish = false) {
  if (!record.text.trim()) {
    if (record.start) yield record.start;
    for (const delta of record.deltas) yield delta;
    if (record.end) yield record.end;
    return;
  }
  const segments = splitSegments(record.text);
  debugLog(ctx, 'voice rewrite block', {
    index: record.index,
    chars: record.text.length,
    segments: segments.length,
    polish
  });
  let finalText = '';
  const pieces = [];
  let cursor = 0;
  for (const segment of segments) {
    const start = record.text.indexOf(segment, cursor);
    const gap = start >= 0 ? record.text.slice(cursor, start) : '\n\n';
    const safeStart = start >= 0 ? start : cursor;
    const leading = segment.match(/^\s*/)?.[0] ?? '';
    const trailing = segment.match(/\s*$/)?.[0] ?? '';
    const core = segment.slice(leading.length, segment.length - trailing.length);
    const edited = core.trim()
      ? await editFinalAnswer(ctx, options, core, fewShotEnabled)
      : null;
    const piece = gap + leading + (edited ?? core) + trailing;
    finalText += piece;
    pieces.push(piece);
    cursor = safeStart + segment.length;
  }
  const tail = record.text.slice(cursor);
  if (tail) {
    finalText += tail;
    pieces.push(tail);
  }

  let polished = null;
  if (polish && finalText.length >= 1500) {
    polished = await polishAnswer(ctx, options, finalText, fewShotEnabled);
    if (polished !== null) finalText = polished;
  }

  if (record.start) yield record.start;
  if (polished !== null) {
    yield { type: 'text-delta', index: record.index, text: finalText };
  } else {
    for (const piece of pieces) yield { type: 'text-delta', index: record.index, text: piece };
  }
  if (record.end) {
    yield { ...record.end, block: { ...record.end.block, text: finalText } };
  }
}

/**
 * 只改写「没有工具调用的纯文本最终回答」；工具步骤原样放行。
 * 先收齐整个流，确认 finish 是 stop 后再按原 text block 改写；
 * 不把多个文本块揉成一个，也不改 reasoning/tool/usage 块。
 * @param ctx - Cordis 上下文。
 * @param options - GenerateOptions。
 * @param next - 下游 llm/stream。
 * @returns 包装后的 chunk 流。
 */
function wrapFinalAnswer(ctx, options, next, fewShotEnabled) {
  if (options.sessionId === undefined || options.purpose !== undefined) return next();
  if (!isRootSession(ctx, options.sessionId)) {
    debugLog(ctx, 'voice skipped: not a root session', { sessionId: options.sessionId });
    return next();
  }
  debugLog(ctx, 'voice hook candidate', { sessionId: options.sessionId });
  return (async function* () {
    const chunks = [];
    for await (const chunk of next()) chunks.push(chunk);

    const finish = chunks.find((chunk) => chunk.type === 'finish');
    if (!finish || finish.reason?.kind !== 'stop') {
      debugLog(ctx, 'voice skipped: finish is not stop', { reason: finish?.reason?.kind ?? 'missing' });
      for (const chunk of chunks) yield chunk;
      return;
    }

    if (chunks.some(isToolChunk)) {
      debugLog(ctx, 'voice skipped: tool-call stream');
      for (const chunk of chunks) yield chunk;
      return;
    }

    const textBlocks = new Map();
    for (const chunk of chunks) {
      if (!isTextChunk(chunk)) continue;
      const index = chunk.index;
      let record = textBlocks.get(index);
      if (!record) {
        record = { index, start: null, end: null, deltas: [], text: '' };
        textBlocks.set(index, record);
      }
      if (chunk.type === 'block-start') record.start = chunk;
      else if (chunk.type === 'text-delta') {
        record.deltas.push(chunk);
        record.text += chunk.text;
      } else if (chunk.type === 'block-end') {
        record.end = chunk;
        if (!record.text) record.text = chunk.block?.text ?? '';
      }
    }

    if (textBlocks.size === 0) {
      debugLog(ctx, 'voice skipped: no text block');
      for (const chunk of chunks) yield chunk;
      return;
    }

    const emitted = new Set();
    const singleBlock = textBlocks.size === 1;
    for (const chunk of chunks) {
      if (isTextChunk(chunk)) {
        const record = textBlocks.get(chunk.index);
        if (!record || emitted.has(record.index)) continue;
        emitted.add(record.index);
        yield* rewriteTextBlock(ctx, options, record, fewShotEnabled, singleBlock);
        continue;
      }
      yield chunk;
    }
  })();
}

/**
 * 注册工作层提示词和最终回答文风编辑。
 * @param ctx - 当前作用域的 Cordis 上下文。
 * @param config - 已校验的插件配置。
 */
export function apply(ctx, config) {
  if ((config.overrideIdentity ?? true) !== false) {
    const order = typeof ctx.systemPrompt.getSectionOrder === 'function'
      ? ctx.systemPrompt.getSectionOrder('HARNESS_IDENTITY')
      : -1000;
    ctx.effect(() => ctx.systemPrompt.section({
      name: 'harness:identity',
      order: Number.isFinite(order) ? order : -1000,
      text: config.identityText ?? 'You are an AI assistant.',
      interpolate: false
    }), 'character-hikari-rento.identity()');
  }

  ctx.effect(() => ctx.systemPrompt.section({
    name: config.sectionName ?? 'character:work-policy',
    order: config.sectionOrder ?? 0,
    text: renderWorkPolicy(config.detail ?? 'standard'),
    interpolate: false
  }), 'character-hikari-rento.work-policy()');

  if ((config.includeRuntimeContext ?? true) === false) ctx.systemPrompt.suppressRuntimeContext();

  ctx.effect(() => ctx.on('llm/stream', (options, next) => wrapFinalAnswer(ctx, options, next, config.fewShotEnabled ?? true)),
    'character-hikari-rento.voice()');
}

/** 兼容旧调用：渲染完整角色文本（2.0 不再把它注入工作层）。 */
export function renderCharacterPrompt(detail, fewShotEnabled, referencesDir = REFERENCES_DIR) {
  const names = DETAIL_SECTIONS[detail] ?? DETAIL_SECTIONS.standard;
  const parts = names.map((sectionName) => CHARACTER.sections[sectionName]).filter(Boolean);
  if (fewShotEnabled && FEW_SHOT.length > 0) {
    const examples = FEW_SHOT
      .map((example) => `- （${example.situation}）${example.line}`)
      .join('\n');
    parts.push(`【示例台词】\n${examples}`);
  }
  return parts.join('\n\n').replaceAll('{{REFERENCES_DIR}}', referencesDir.replace(/\\/g, '/'));
}

/** 运行时配置。 */
export const Config = z.object({
  /** 工作层档案路由深度：minimal 只给核心策略；standard 加档案路由；full 再加档案纪律。 */
  detail: z.union(['minimal', 'standard', 'full']).default('standard'),
  /** 文风编辑是否附上示例台词。 */
  fewShotEnabled: z.boolean().default(true),
  /** 工作层段落名。 */
  sectionName: z.string().default('character:work-policy'),
  /** 工作层段落排序值。 */
  sectionOrder: z.number().default(0),
  /** 是否遮蔽 DSH 自带的 harness:identity 段。 */
  overrideIdentity: z.boolean().default(true),
  /** 遮蔽后的身份段文案；默认中性，最终回答由文风层处理。 */
  identityText: z.string().default('You are an AI assistant.'),
  /** 是否包含动态 runtime-context 快照。 */
  includeRuntimeContext: z.boolean().default(true)
});

/** 便于测试和别的插件读取文本处理函数。 */
export const voice = {
  protectText,
  restoreText,
  validateRewrite,
  renderWorkPolicy,
  renderVoiceGuide,
  buildEditorRequest,
  renderProtectedContext,
  splitSegments,
  verifyRewrite,
  wrapFinalAnswer
};

/** 便于别的插件或测试读取角色定义。 */
export const character = CHARACTER;
