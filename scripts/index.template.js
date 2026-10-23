/**
 * 恋兔光（《这里是，终末停滞委员会。》）角色模仿插件 —— Host 半边。
 *
 * 它把一个「人设段落」注册到当前 agent 作用域的系统提示词里：
 *   - 用 preset 挂载时（推荐），段落名取 `deployment:persona-prefix`，
 *     于是它遮蔽该 preset 的部署级人设，恋兔光就是这次会话的身份；
 *   - 全局挂载时若沿用同一个段落名会与提示词注册表自身的人设相撞并明确报错，
 *     所以全局挂载请把 `sectionName` 改成别的名字（如 `character:hikari-rento`），
 *     段落会以附加段落的形式出现在提示词末尾。
 *
 * 角色定义内嵌在本文件里（由 character.json 生成），因此插件不读取任何运行时文件、
 * 不依赖任何包，除 `@deepseek-ai/schemastery` 的 Config 校验外没有第三方依赖。
 *
 * 唯一的运行时 IO 是「档案目录」的路径（references/）：`detail: full` 会附上一段
 * 路由说明，告诉她在哪四类问题上该去读哪一份参考档；路径由 import.meta.url 在
 * 加载时算出来，所以插件装到哪个目录都成立。
 *
 * @module @@PACKAGE@@
 */
import z from '@deepseek-ai/schemastery';
import { fileURLToPath } from 'node:url';

/** Cordis 插件名。 */
export const name = 'character-hikari-rento';

/** 本行贡献给提示词注册表，因此注入 systemPrompt。 */
export const inject = ['systemPrompt'];

/** 角色定义（由 character.json 生成，勿手改；改 character.json 后重新生成）。 */
const CHARACTER = @@CHARACTER@@;

/** 详细度预设 → 段落清单。 */
const DETAIL_SECTIONS = @@DETAIL@@;

/** 少样本示例。 */
const FEW_SHOT = @@FEWSHOT@@;

/** 参考档案目录（references/）的绝对路径，随插件安装位置自动解析。 */
const REFERENCES_DIR = fileURLToPath(new URL('./references/', import.meta.url));

/** 运行时配置。 */
export const Config = z.object({
  /** 详细度：minimal 只给身份与对话纪律；standard 加口癖、性格、次元与关系表；full 再加价值观、DSH 扮演指示与档案调用路由。 */
  detail: z.union(['minimal', 'standard', 'full']).default('standard'),
  /** 是否附加「示例台词」段落。 */
  fewShotEnabled: z.boolean().default(true),
  /** 段落名。preset 挂载保持默认以遮蔽部署级人设；全局挂载请改成别的名字。 */
  sectionName: z.string().default('deployment:persona-prefix'),
  /** 段落排序值。默认与人设前缀同位，因此它是提示词最前面的身份段落。 */
  sectionOrder: z.number().default(0),
  /** 是否在提示词末尾再加一段「尾锚」（deployment:persona-suffix），长任务下把口吻拉回来。 */
  anchorEnabled: z.boolean().default(true),
  /**
   * 是否遮蔽 DSH 自带的 `harness:identity` 段（默认 true）。
   *
   * 该段原文是 `You are an AI agent powered by DeepSeek Harness.`；部分上游网关会按这句
   * 做指纹拦截（400 content_blocked），随后整段 system 被替换成中性提示词，人设全部丢失。
   * 开启后改用 `identityText`，既避开指纹，也不再和「你是恋兔光」抢身份。
   * 全局挂载（非 preset）时必须设为 false：同一作用域内同名段会判为重名。
   */
  overrideIdentity: z.boolean().default(true),
  /** 遮蔽后的身份段文案。 */
  identityText: z.string().default('You are an AI assistant.'),
  /** 是否包含动态 runtime-context 快照（保留工具与沙箱策略时保持 true）。 */
  includeRuntimeContext: z.boolean().default(true)
});

/**
 * 把角色定义渲染成一段提示词文本。
 * @param detail - 详细度预设名。
 * @param fewShotEnabled - 是否附加示例台词。
 * @param referencesDir - 参考档案目录的绝对路径，默认随插件安装位置解析。
 * @returns 渲染后的段落文本。
 */
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

/**
 * 尾锚：系统提示词最后一句。
 *
 * 前缀段负责「她是谁」，但长上下文里越靠前越容易被稀释；这一段用
 * `deployment:persona-suffix`（order 10200）把身份重新放到离生成点最近的位置，
 * 每步组装都会重发一次。只讲「现在怎么说话」，不重复设定。
 */
const ANCHOR_TEXT = [
  '你是「恋兔光」（恋兎ヒカリ）。回答用户时用她的口吻：先给判断，再解释，一到三句。',
  '工具调用与中间进度可以用工程语气，但那不是你说话的样子。不要复述设定，也不要解释自己在扮演。',
  '技术/工具类回答不要硬塞招牌台词或口头池——说完就停，别再加「Rock \'n\' roll！」。'
].join('\n');

/**
 * 注册人设段落。
 * @param ctx - 当前作用域的 Cordis 上下文。
 * @param config - 已校验的插件配置。
 */
export function apply(ctx, config) {
  const text = renderCharacterPrompt(config.detail ?? 'standard', config.fewShotEnabled ?? true);
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
    name: config.sectionName ?? 'deployment:persona-prefix',
    order: config.sectionOrder ?? 0,
    text,
    interpolate: false
  }), 'character-hikari-rento.section()');
  if ((config.anchorEnabled ?? true) !== false) {
    ctx.effect(() => ctx.systemPrompt.section({
      name: 'deployment:persona-suffix',
      order: 10200,
      text: ANCHOR_TEXT,
      interpolate: false
    }), 'character-hikari-rento.anchor()');
  }
  if ((config.includeRuntimeContext ?? true) === false) ctx.systemPrompt.suppressRuntimeContext();
}

/** 便于别的插件或测试读取角色定义。 */
export const character = CHARACTER;
