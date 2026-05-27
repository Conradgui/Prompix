import { describe, expect, it } from 'vitest';
import { normalizeModelOutput, sanitizeThinkingText } from '../../lib/server/model-output';

describe('model output normalization', () => {
  it('splits think tags from final answer', () => {
    const input = '<think>内部推理步骤</think>\n\n最终答案内容';
    const output = normalizeModelOutput(input);
    expect(output.thinkingText).toBe('内部推理步骤');
    expect(output.finalText).toBe('最终答案内容');
  });

  it('supports thinking tag variant', () => {
    const input = '<thinking>reasoning block</thinking>\n\nfinal text';
    const output = normalizeModelOutput(input);
    expect(output.thinkingText).toBe('reasoning block');
    expect(output.finalText).toBe('final text');
  });

  it('extracts prefixed thinking when separated by blank line', () => {
    const input = '思考：先判断上下文\n\n这是最后回复';
    const output = normalizeModelOutput(input);
    expect(output.thinkingText).toBe('思考：先判断上下文');
    expect(output.finalText).toBe('这是最后回复');
  });

  it('keeps plain output unchanged without thinking', () => {
    const input = '直接返回结果';
    const output = normalizeModelOutput(input);
    expect(output.thinkingText).toBe('');
    expect(output.finalText).toBe('直接返回结果');
  });

  it('does not drop content if only think block is present', () => {
    const input = '<think>{"k":"v"}</think>';
    const output = normalizeModelOutput(input);
    expect(output.thinkingText).toBe('{"k":"v"}');
    expect(output.finalText).toBe('{"k":"v"}');
  });

  it('sanitizes noisy thinking lines while keeping useful reasoning', () => {
    const input = [
      'We need to parse the user request.',
      'User says: "仅输出 JSON：{\\"def\\":\\"...\\",\\"app\\":\\"...\\"}"',
      '先判断术语领域与语义边界。',
      '再给出定义和应用场景。',
      '{"def":"...","app":"..."}',
    ].join('\n');
    const output = sanitizeThinkingText(input);
    expect(output).toContain('先判断术语领域与语义边界。');
    expect(output).toContain('再给出定义和应用场景。');
    expect(output).not.toContain('We need to parse');
    expect(output).not.toContain('仅输出 JSON');
    expect(output).not.toContain('"def"');
  });

  it('removes term-explainer instruction echoes while preserving useful reasoning', () => {
    const input = [
      '你是一名资深视觉总监。请解释术语 "significant negative space on right side"。',
      '目标语言：Chinese。',
      '必须只输出一个 JSON 对象，禁止输出任何额外文字。',
      'JSON 结构固定为：{"def":"...","app":"..."}',
      '约束：',
      '1. def 与 app 均不能为空。',
      '2. def = 简洁定义；app = 在视觉创作中的具体应用方式。',
      '先判断该术语是否强调构图中的负空间比例与视觉平衡。',
      '再给出在海报与电商主图中的应用建议。',
    ].join('\n');

    const output = sanitizeThinkingText(input);
    expect(output).toContain('先判断该术语是否强调构图中的负空间比例与视觉平衡。');
    expect(output).toContain('再给出在海报与电商主图中的应用建议。');
    expect(output).not.toContain('你是一名资深视觉总监');
    expect(output).not.toContain('请解释术语');
    expect(output).not.toContain('必须只输出一个 JSON 对象');
    expect(output).not.toContain('JSON 结构固定为');
    expect(output).not.toContain('def 与 app 均不能为空');
  });
});
