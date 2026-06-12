/**
 * ワークフロー設定オブジェクトからYAML文字列を生成するモジュール
 *
 * config = {
 *   name: string,
 *   description: string,
 *   prefix: string,
 *   rework_limit?: number,          // 差し戻し上限（省略時は 2）
 *   steps: Array<{
 *     id: string,
 *     agent: string,
 *     label: string,
 *     description?: string,
 *     on_complete?: { next: string } | { action: 'close_issue' },
 *     conditions?: Array<{
 *       id: string,
 *       description: string,
 *       criteria: string[],
 *       next: string | string[]   // string[] の場合は並列
 *     }>,
 *     // condition は旧キー trigger でも受け取れるが、出力は condition に統一する
 *     on_rework?: { condition: string, next: string, limit_exceeded_next?: string },
 *     on_escalation?: { next: string },
 *     parallel_with?: string,
 *     // AND待機。旧キー requires でも受け取れるが、出力は requires_all_of に統一する
 *     requires_all_of?: string[]
 *   }>
 * }
 */

/**
 * next の値をYAML形式の文字列に変換する
 * - 配列の場合: [a, b] 形式
 * - 単一文字列の場合: そのまま
 */
function formatNext(next) {
  if (Array.isArray(next)) {
    return `[${next.join(', ')}]`;
  }
  return next;
}

/**
 * description テキストをYAML行として整形する
 * - 改行を含む場合: ブロックスカラー形式（|）
 * - 改行なし: インライン形式
 * @param {string} text - 説明テキスト
 * @param {string} indent - インデント文字列
 * @returns {string|null} YAML行文字列、またはテキストが空の場合はnull
 */
function formatDescription(text, indent) {
  if (!text) return null;
  if (text.includes('\n')) {
    const lines = text.split('\n');
    return [`${indent}description: |`, ...lines.map(l => `${indent}  ${l}`)].join('\n');
  }
  return `${indent}description: ${text}`;
}

/**
 * ワークフロー設定オブジェクトからYAML文字列を生成する純粋関数
 * @param {object} config - ワークフロー設定オブジェクト
 * @returns {string} YAML文字列
 */
export function buildWorkflowYaml(config) {
  const lines = [];

  // ヘッダー部分
  lines.push(`name: ${config.name}`);
  const headerDesc = formatDescription(config.description, '');
  if (headerDesc) {
    lines.push(headerDesc);
  }
  lines.push('');
  lines.push('# 同一Issueでの差し戻し上限。3回目の不合格（差し戻し）は escalated:human へ');
  lines.push(`rework_limit: ${config.rework_limit ?? 2}`);
  lines.push('');
  lines.push('labels:');
  lines.push(`  prefix: "${config.prefix}"`);
  lines.push('');
  lines.push('steps:');

  for (const step of config.steps) {
    lines.push('');
    lines.push(`  - id: ${step.id}`);
    lines.push(`    agent: ${step.agent}`);
    lines.push(`    label: "${step.label}"`);

    // description が空文字列・undefined の場合は省略
    const stepDesc = formatDescription(step.description, '    ');
    if (stepDesc) {
      lines.push(stepDesc);
    }

    // conditions がある場合は on_complete を出力しない（排他）
    if (step.conditions && step.conditions.length > 0) {
      lines.push('    conditions:');
      for (const cond of step.conditions) {
        lines.push(`      - id: ${cond.id}`);
        lines.push(`        description: ${cond.description}`);
        lines.push('        criteria:');
        for (const criterion of cond.criteria) {
          lines.push(`          - ${criterion}`);
        }
        lines.push(`        next: ${formatNext(cond.next)}`);
      }
    } else if (step.on_complete) {
      lines.push('    on_complete:');
      if (step.on_complete.action === 'close_issue') {
        lines.push('      action: close_issue');
      } else {
        lines.push(`      next: ${formatNext(step.on_complete.next)}`);
      }
    }

    // on_rework は undefined/null の場合は省略
    if (step.on_rework) {
      // 旧キー trigger で渡された場合も condition に統一して出力する
      const reworkCondition = step.on_rework.condition ?? step.on_rework.trigger;
      lines.push('    on_rework:');
      lines.push(`      condition: "${reworkCondition}"`);
      lines.push(`      next: ${step.on_rework.next}`);
      // rework_limit 超過時の遷移先（省略時は human-escalator）
      lines.push(`      limit_exceeded_next: ${step.on_rework.limit_exceeded_next ?? 'human-escalator'}`);
    }

    // on_escalation は undefined/null の場合は省略
    if (step.on_escalation) {
      lines.push('    on_escalation:');
      lines.push(`      next: ${step.on_escalation.next}`);
    }

    // parallel_with は undefined/null の場合は省略
    if (step.parallel_with) {
      lines.push(`    parallel_with: ${step.parallel_with}`);
    }

    // requires_all_of は undefined/null の場合は省略、1件でも配列形式
    // 旧キー requires で渡された場合も requires_all_of に統一して出力する
    const requiresAllOf = step.requires_all_of ?? step.requires;
    if (requiresAllOf && requiresAllOf.length > 0) {
      lines.push(`    requires_all_of: [${requiresAllOf.join(', ')}]`);
    }
  }

  lines.push('');
  return lines.join('\n');
}
