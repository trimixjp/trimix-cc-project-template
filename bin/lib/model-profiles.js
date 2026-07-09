/**
 * モデル・effort プロファイル定義（単一の信頼できる情報源）
 *
 * setup 時に選択したプロファイルを各エージェント / スキルの frontmatter に反映する。
 * 細かい調整は各 md ファイルの model / effort を直接編集する（ドキュメント明記済み）。
 *
 * role:
 *   leader  … オーケストレータ・チームリーダー（上流・設計）
 *   worker  … 実装・レビュー・調査などの作業者
 *   simple  … PR作成・版バンプ・公開など定型の単純作業
 */

/** @typedef {'leader' | 'worker' | 'simple'} ModelRole */
/** @typedef {'high-performance' | 'balance' | 'low-cost'} PerformanceProfile */
/** @typedef {'deep' | 'normal' | 'light'} EffortProfile */

/**
 * 性能プロファイル → role ごとのモデルエイリアス
 * （バージョン固定のモデル ID は禁止。opus / sonnet / haiku / fable のみ）
 */
export const PERFORMANCE_PROFILES = {
  'high-performance': {
    id: 'high-performance',
    label: 'ハイパフォーマンス',
    description: '指揮者 fable、作業者 opus、単純作業 sonnet',
    models: { leader: 'fable', worker: 'opus', simple: 'sonnet' },
  },
  balance: {
    id: 'balance',
    label: 'バランス（デフォルト）',
    description: '指揮者 opus、作業者 sonnet、単純作業 haiku',
    models: { leader: 'opus', worker: 'sonnet', simple: 'haiku' },
  },
  'low-cost': {
    id: 'low-cost',
    label: '低コスト',
    description: '指揮者 sonnet、作業者 sonnet、単純作業 haiku',
    models: { leader: 'sonnet', worker: 'sonnet', simple: 'haiku' },
  },
};

/**
 * effort 深度プロファイル
 * 深く=全て xhigh / 普通=high / 軽く=medium（high 未満）
 */
export const EFFORT_PROFILES = {
  deep: {
    id: 'deep',
    label: '深く',
    description: '全エージェント・スキルに xhigh',
    effort: 'xhigh',
  },
  normal: {
    id: 'normal',
    label: '普通（デフォルト）',
    description: '全エージェント・スキルに high',
    effort: 'high',
  },
  light: {
    id: 'light',
    label: '軽く',
    description: '全エージェント・スキルに medium',
    effort: 'medium',
  },
};

/** テンプレート既定（未指定時） */
export const DEFAULT_PERFORMANCE_PROFILE = 'balance';
export const DEFAULT_EFFORT_PROFILE = 'normal';

/**
 * エージェント name → role
 * 未登録の name は worker として扱う
 */
export const AGENT_ROLES = {
  // 共有
  dispatcher: 'leader',
  contributor: 'leader',
  'human-escalator': 'leader',

  // backend
  'tech-lead': 'leader',
  implementer: 'worker',
  reviewer: 'worker',
  'reviewer-a': 'worker',
  'reviewer-b': 'worker',
  'pr-creator': 'simple',
  'version-bumper': 'simple',
  'tech-writer': 'simple',

  // frontend
  'frontend-lead': 'leader',
  designer: 'worker',
  developer: 'worker',
  // reviewer / reviewer-a / reviewer-b / pr-creator は上記と共有

  // content
  'editor-in-chief': 'leader',
  writer: 'worker',
  researcher: 'worker',
  compliance: 'worker',

  // infra
  'infra-lead': 'leader',
  architect: 'leader',
  'infra-specialist': 'worker',
  'network-engineer': 'worker',
  'security-engineer': 'worker',

  // sns
  strategist: 'leader',
  operator: 'worker',
  // writer / researcher は content と共有キー

  // youtube
  director: 'leader',
  'channel-producer': 'leader',
  'market-analyst': 'leader',
  scriptwriter: 'worker',
  'script-qa': 'worker',
  'growth-strategist': 'worker',
  'growth-qa': 'worker',
  affiliate: 'worker',
  'affiliate-qa': 'worker',
  editor: 'simple',
  'render-reviewer': 'worker',
  publisher: 'simple',
  'publish-qa': 'worker',
  'sns-distributor': 'worker',
  'sns-qa': 'worker',
  monetizer: 'worker',
  'monetizer-qa': 'worker',
  'channel-producer-qa': 'worker',
};

/**
 * スキル（コマンド）name → role
 * オーケストレータ系は leader、定型操作は simple
 */
export const SKILL_ROLES = {
  'ai-team-setup': 'leader',
  'ai-team-run': 'leader',
  'ai-team-watch': 'leader',
  'ai-team-resume': 'leader',
  'ai-team-create': 'leader',
  'ai-team-configure': 'worker',
  'ai-team-install': 'simple',
  'ai-team-gallery': 'simple',
};

/** 許可するモデルエイリアス（バージョン固定 ID は禁止） */
export const ALLOWED_MODEL_ALIASES = new Set(['fable', 'opus', 'sonnet', 'haiku', 'inherit']);

/** 許可する effort 値 */
export const ALLOWED_EFFORT_LEVELS = new Set(['low', 'medium', 'high', 'xhigh', 'max']);

/**
 * @param {string} name
 * @param {'agent' | 'skill'} kind
 * @returns {ModelRole}
 */
export function resolveRole(name, kind = 'agent') {
  const map = kind === 'skill' ? SKILL_ROLES : AGENT_ROLES;
  return map[name] ?? 'worker';
}

/**
 * @param {PerformanceProfile | string} performanceId
 * @param {ModelRole} role
 * @returns {string}
 */
export function resolveModel(performanceId, role) {
  const profile = PERFORMANCE_PROFILES[performanceId];
  if (!profile) {
    throw new Error(`不明な性能プロファイル: ${performanceId}`);
  }
  const model = profile.models[role];
  if (!model) {
    throw new Error(`role "${role}" のモデル定義がありません（profile=${performanceId}）`);
  }
  return model;
}

/**
 * @param {EffortProfile | string} effortId
 * @returns {string}
 */
export function resolveEffort(effortId) {
  const profile = EFFORT_PROFILES[effortId];
  if (!profile) {
    throw new Error(`不明な effort プロファイル: ${effortId}`);
  }
  return profile.effort;
}

/**
 * YAML frontmatter に model / effort / model_role を upsert する。
 * frontmatter が無い場合は先頭に追加する。
 *
 * @param {string} content
 * @param {{ model: string, effort: string, modelRole?: ModelRole }} opts
 * @returns {{ content: string, changed: boolean }}
 */
export function upsertModelEffortFrontmatter(content, { model, effort, modelRole }) {
  if (!ALLOWED_MODEL_ALIASES.has(model)) {
    throw new Error(`許可されていないモデルエイリアス: ${model}`);
  }
  if (!ALLOWED_EFFORT_LEVELS.has(effort)) {
    throw new Error(`許可されていない effort: ${effort}`);
  }

  const normalized = content.replace(/^\uFEFF/, '');
  const fmMatch = normalized.match(/^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/);

  if (!fmMatch) {
    const roleLine = modelRole ? `model_role: ${modelRole}\n` : '';
    const block = `---\nmodel: ${model}\neffort: ${effort}\n${roleLine}---\n\n`;
    return { content: block + normalized, changed: true };
  }

  let fmBody = fmMatch[1];
  const rest = normalized.slice(fmMatch[0].length);

  const setOrReplace = (body, key, value) => {
    const re = new RegExp(`^${key}:\\s*.*$`, 'm');
    if (re.test(body)) {
      return body.replace(re, `${key}: ${value}`);
    }
    // description の直後、または末尾に挿入
    if (/^description:\s*.*$/m.test(body)) {
      return body.replace(/^(description:\s*.*)$/m, `$1\n${key}: ${value}`);
    }
    if (/^name:\s*.*$/m.test(body)) {
      return body.replace(/^(name:\s*.*)$/m, `$1\n${key}: ${value}`);
    }
    return `${body}\n${key}: ${value}`;
  };

  let next = fmBody;
  next = setOrReplace(next, 'model', model);
  next = setOrReplace(next, 'effort', effort);
  if (modelRole) {
    next = setOrReplace(next, 'model_role', modelRole);
  }

  // model / effort / model_role の順序を整える（name, description の後）
  next = orderFrontmatterKeys(next);

  const newContent = `---\n${next}\n---\n${rest.startsWith('\n') || rest.startsWith('\r') ? rest : `\n${rest}`}`;
  return { content: newContent, changed: newContent !== normalized };
}

/**
 * frontmatter キーを推奨順に並べる（不明キーは末尾に維持）
 * @param {string} fmBody
 */
function orderFrontmatterKeys(fmBody) {
  const preferred = ['name', 'description', 'model', 'effort', 'model_role'];
  const lines = fmBody.split(/\r?\n/);
  const keyed = [];
  const others = [];
  const map = new Map();

  for (const line of lines) {
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (m) {
      map.set(m[1], line);
      keyed.push(m[1]);
    } else if (line.trim() !== '') {
      others.push(line);
    }
  }

  const ordered = [];
  const seen = new Set();
  for (const key of preferred) {
    if (map.has(key)) {
      ordered.push(map.get(key));
      seen.add(key);
    }
  }
  for (const key of keyed) {
    if (!seen.has(key) && map.has(key)) {
      ordered.push(map.get(key));
      seen.add(key);
    }
  }
  return [...ordered, ...others].join('\n');
}

/**
 * frontmatter から name を取得
 * @param {string} content
 * @returns {string | null}
 */
export function extractFrontmatterName(content) {
  const m = content.replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const nameMatch = m[1].match(/^name:\s*(.+)$/m);
  if (!nameMatch) return null;
  return nameMatch[1].trim().replace(/^["']|["']$/g, '');
}
