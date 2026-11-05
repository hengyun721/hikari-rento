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

/** 参考档案目录（references/）的绝对路径，随插件安装位置自动解析。 */
const REFERENCES_DIR = fileURLToPath(new URL('./references/', import.meta.url));

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

const FINAL_FORMAT = [
  '【最终回答格式】',
  '如果最终回答包含客观、严谨、可直接交付的内容（条例总结、数据、步骤、结论、代码说明等），按下面两块写：',
  '【正文】',
  '客观、完整、中立的正文；不要加入口癖、自称、吐槽或角色判断。',
  '【吐槽】',
  '可选的 1 到 3 句短评；先写一句中性短评即可，文风层会把它转换成恋兔光口吻，不要复述正文事实。',
  '纯闲聊、角色问答、剧情问题不需要分块，整段交给文风层处理。',
  '文件内容、工具参数、代码和命令永远不要使用这个格式，也不要用角色口吻。'
].join('\n');

/**
 * 把工作层策略渲染成系统提示词文本。
 * @param detail - minimal 只给核心策略；standard 加档案路由；full 再加档案纪律。
 * @param referencesDir - 参考档案目录的绝对路径。
 * @returns 工作层提示词。
 */
export function renderWorkPolicy(detail, referencesDir = REFERENCES_DIR) {
  const level = detail === 'minimal' || detail === 'full' ? detail : 'standard';
  const parts = [WORK_POLICY, FINAL_FORMAT];
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
  return parts.join('\n\n');
}

const VOICE_RULES = [
  '你是恋兔光的文风编辑，不是任务执行者。',
  '输入是一段已经完成的最终回答。只改措辞、语气、节奏，让它在不改变事实的前提下像恋兔光。',
  '硬规则：',
  '- 不得新增、删除或改变任何事实、数字、路径、命令、代码、文件名、结论、步骤、风险、警告、引用。',
  '- 原文里的 ⟦P0⟧ 形式是受保护片段，必须原样保留；不要改写、删除、移动或新增占位符。',
  '- 保留 Markdown 结构、标题、列表、表格、代码块、链接。',
  '- 不要解释自己在编辑，不要输出前言、后记或“作为恋兔光”之类的话。',
  '- 这是最终回答，不是工具步骤；除代码、命令、路径等受保护片段外，正文都要用恋兔光口吻。',
  '- 如果无法在不改变事实的情况下改写，原样输出输入。',
  '只输出改写后的回答。'
].join('\n');

const FACT_CHECK_RULES = [
  '你是事实校验器，不是编辑。比较下面两段文本。',
  '只输出 PASS 或 FAIL，不要解释。',
  '出现以下任一情况就输出 FAIL：新增、删除或改变事实、数字、路径、命令、代码、文件名、结论、步骤、风险、警告、关系或不确定性。',
  '只有文风、措辞、语气变化，事实完全一致时才输出 PASS。'
].join('\n');

const COMMENTARY_RULES = [
  '你是恋兔光的文风编辑，只改写【吐槽】部分。',
  '【正文】是只读上下文：不得改写、删除、复述或评价它；只输出改写后的吐槽。',
  '吐槽只改措辞、语气、节奏，不新增事实、数字、路径、命令、代码、文件名、结论或风险。',
  '原文里的 ⟦P0⟧ 形式是受保护片段，必须原样保留；不要改写、删除、移动或新增占位符。',
  '吐槽保持 1 到 3 句，不要解释自己在编辑，不要输出前言、后记或“作为恋兔光”之类的话。',
  '如果无法在不改变事实的情况下改写，原样输出吐槽。',
  '只输出吐槽正文，不要输出【正文】或【吐槽】标签。'
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
    /```[\s\S]*?```/g,
    /`[^`\n]+`/g,
    /https?:\/\/[^\s<>"'）)]+/g,
    /[A-Za-z]:[\\/][^\s，。；：、）)]+/g,
    /(?:~|\.{1,2})?\/[^\s，。；：、）)]+/g,
    /\b[\w.-]+\.(?:md|json|jsonl|js|mjs|cjs|ts|tsx|jsx|py|go|rs|java|c|cc|cpp|h|hpp|cs|exe|zip|tar|gz|png|jpe?g|webp|svg|yaml|yml|toml|txt|csv|xlsx|docx|pdf)\b/gi,
    /\b\d+(?:\.\d+)?%?\b/g
  ];
  const ranges = [];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      ranges.push([match.index, match.index + match[0].length]);
    }
  }
  ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const spans = [];
  let out = '';
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (start < cursor) continue;
    out += text.slice(cursor, start) + `${tag}${spans.length}⟧`;
    spans.push(text.slice(start, end));
    cursor = end;
  }
  out += text.slice(cursor);
  return { text: out, spans, tag };
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
 * 生成文风编辑请求。
 * @param original - 原始最终回答。
 * @param fewShotEnabled - 是否附示例台词。
 * @returns system、user、受保护片段。
 */
export function buildEditorRequest(original, fewShotEnabled = true) {
  const protectedData = protectText(original);
  return {
    system: `${VOICE_RULES}\n\n【恋兔光的声音】\n\n${renderVoiceGuide(fewShotEnabled)}`,
    user: `【最终回答】\n${protectedData.text}`,
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
      maxTokens: 64,
      signal: options.signal
    })) {
      if (chunk.type === 'tool-call-delta') return false;
      if (chunk.type === 'text-delta') raw += chunk.text;
      if (chunk.type === 'finish') {
        if (chunk.reason?.kind !== 'stop') return false;
        break;
      }
    }
  } catch {
    return false;
  }
  return /^\s*PASS\b/i.test(raw.trim());
}

/**
 * 拆分「客观正文」与「吐槽」。
 * @param text - 最终回答。
 * @returns 正文、吐槽；没有【正文】标记时返回 null。
 */
export function splitFinalAnswer(text) {
  const head = '【正文】';
  const tail = '【吐槽】';
  const start = text.indexOf(head);
  if (start < 0) return null;
  const tailStart = text.indexOf(tail, start + head.length);
  const objective = text.slice(start + head.length, tailStart < 0 ? text.length : tailStart).trim();
  if (!objective) return null;
  const commentary = tailStart < 0 ? '' : text.slice(tailStart + tail.length).trim();
  return { objective, commentary };
}

async function editCommentary(ctx, options, objective, commentary, fewShotEnabled) {
  if (!commentary.trim() || typeof ctx.llm?.stream !== 'function') return null;
  const protectedData = protectText(commentary);
  let raw = '';
  try {
    for await (const chunk of ctx.llm.stream({
      provider: options.provider,
      model: options.model,
      system: `${COMMENTARY_RULES}\n\n【恋兔光的声音】\n\n${renderVoiceGuide(fewShotEnabled)}`,
      messages: [{
        role: 'user',
        content: [{
          type: 'text',
          text: `【只读正文】\n${objective}\n\n【待改写吐槽】\n${protectedData.text}`
        }]
      }],
      maxTokens: Math.min(2048, Math.max(256, Math.ceil(commentary.length * 2))),
      signal: options.signal
    })) {
      if (chunk.type === 'tool-call-delta') return null;
      if (chunk.type === 'text-delta') raw += chunk.text;
      if (chunk.type === 'block-end' && !raw && chunk.block?.type === 'text') raw = chunk.block.text ?? '';
      if (chunk.type === 'finish') {
        if (chunk.reason?.kind !== 'stop') return null;
        break;
      }
    }
  } catch {
    return null;
  }
  const restored = restoreText(raw.trim(), protectedData);
  return restored !== null && validateRewrite(commentary, restored) ? restored : null;
}

async function editFinalAnswer(ctx, options, original, fewShotEnabled) {
  if (typeof ctx.llm?.stream !== 'function') return null;
  const { system, user, protectedData } = buildEditorRequest(original, fewShotEnabled);
  let raw = '';
  let sawDelta = false;
  try {
    for await (const chunk of ctx.llm.stream({
      provider: options.provider,
      model: options.model,
      system,
      messages: [{ role: 'user', content: [{ type: 'text', text: user }] }],
      maxTokens: Math.min(16384, Math.max(512, Math.ceil(original.length * 1.5))),
      signal: options.signal
    })) {
      if (chunk.type === 'tool-call-delta') return null;
      if (chunk.type === 'text-delta') {
        raw += chunk.text;
        sawDelta = true;
      }
      if (chunk.type === 'block-end' && !sawDelta && chunk.block?.type === 'text') {
        raw += chunk.block.text ?? '';
      }
      if (chunk.type === 'finish') {
        if (chunk.reason?.kind !== 'stop') return null;
        break;
      }
    }
  } catch {
    return null;
  }
  const restored = restoreText(raw.trim(), protectedData);
  if (restored === null || !validateRewrite(original, restored)) return null;
  return (await verifyRewrite(ctx, options, original, restored)) ? restored : null;
}

function isTextChunk(chunk) {
  return (chunk.type === 'block-start' && chunk.blockType === 'text') ||
    chunk.type === 'text-delta' ||
    (chunk.type === 'block-end' && chunk.block?.type === 'text');
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

/**
 * 只改写「没有工具调用的纯文本最终回答」；工具步骤原样放行。
 * @param ctx - Cordis 上下文。
 * @param options - GenerateOptions。
 * @param next - 下游 llm/stream。
 * @returns 包装后的 chunk 流。
 */
function wrapFinalAnswer(ctx, options, next, fewShotEnabled) {
  if (options.sessionId === undefined || options.purpose !== undefined) return next();
  if (!isRootSession(ctx, options.sessionId)) return next();
  return (async function* () {
    const pendingText = [];
    const terminal = [];
    let text = '';
    let hasTool = false;
    let passThrough = false;
    let textIndex;
    let maxIndex = -1;

    for await (const chunk of next()) {
      if (typeof chunk.index === 'number') maxIndex = Math.max(maxIndex, chunk.index);

      if (passThrough) {
        yield chunk;
        continue;
      }

      if (chunk.type === 'tool-call-delta' ||
        (chunk.type === 'block-start' && chunk.blockType === 'tool-call')) {
        hasTool = true;
        passThrough = true;
        for (const pending of pendingText) yield pending;
        pendingText.length = 0;
        yield chunk;
        continue;
      }

      if (chunk.type === 'usage' || chunk.type === 'finish') {
        terminal.push(chunk);
        continue;
      }

      if (isTextChunk(chunk)) {
        pendingText.push(chunk);
        if (chunk.type === 'text-delta') text += chunk.text;
        if (chunk.type === 'block-end' && !text) text = chunk.block.text ?? '';
        if (textIndex === undefined) textIndex = chunk.index;
        continue;
      }

      yield chunk;
    }

    if (hasTool) {
      for (const pending of pendingText) yield pending;
      for (const chunk of terminal) yield chunk;
      return;
    }

    if (!text.trim()) {
      for (const pending of pendingText) yield pending;
      for (const chunk of terminal) yield chunk;
      return;
    }

    const structured = splitFinalAnswer(text);
    if (structured) {
      const editedCommentary = structured.commentary
        ? await editCommentary(ctx, options, structured.objective, structured.commentary, fewShotEnabled)
        : null;
      const finalText = structured.commentary
        ? `${structured.objective}\n\n${editedCommentary ?? structured.commentary}`
        : structured.objective;
      const index = textIndex ?? (maxIndex + 1);
      yield { type: 'block-start', index, blockType: 'text' };
      yield { type: 'text-delta', index, text: finalText };
      yield { type: 'block-end', index, block: { type: 'text', text: finalText } };
      for (const chunk of terminal) yield chunk;
      return;
    }

    const edited = await editFinalAnswer(ctx, options, text, fewShotEnabled);
    if (edited === null) {
      for (const pending of pendingText) yield pending;
      for (const chunk of terminal) yield chunk;
      return;
    }

    const index = textIndex ?? (maxIndex + 1);
    yield { type: 'block-start', index, blockType: 'text' };
    yield { type: 'text-delta', index, text: edited };
    yield { type: 'block-end', index, block: { type: 'text', text: edited } };
    for (const chunk of terminal) yield chunk;
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
  splitFinalAnswer,
  verifyRewrite,
  wrapFinalAnswer
};

/** 便于别的插件或测试读取角色定义。 */
export const character = CHARACTER;
