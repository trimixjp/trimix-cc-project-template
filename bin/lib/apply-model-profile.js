/**
 * モデル・effort プロファイルをエージェント / スキル md に反映する。
 *
 * 使い方:
 *   node bin/lib/apply-model-profile.js --profile balance --effort normal --dir templates
 *   node bin/lib/apply-model-profile.js --profile high-performance --effort deep --dir .claude
 *   node bin/lib/apply-model-profile.js --profile low-cost --effort light --dir . --skills-only
 *   node bin/lib/apply-model-profile.js --dry --profile balance --effort normal --dir templates
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, relative, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  PERFORMANCE_PROFILES,
  EFFORT_PROFILES,
  DEFAULT_PERFORMANCE_PROFILE,
  DEFAULT_EFFORT_PROFILE,
  resolveRole,
  resolveModel,
  resolveEffort,
  upsertModelEffortFrontmatter,
  extractFrontmatterName,
} from './model-profiles.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, '../..');

/**
 * @param {string[]} argv
 */
export function parseArgs(argv = process.argv.slice(2)) {
  const opts = {
    profile: DEFAULT_PERFORMANCE_PROFILE,
    effort: DEFAULT_EFFORT_PROFILE,
    dir: null,
    dry: false,
    skillsOnly: false,
    agentsOnly: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--profile' || a === '-p') opts.profile = argv[++i];
    else if (a === '--effort' || a === '-e') opts.effort = argv[++i];
    else if (a === '--dir' || a === '-d') opts.dir = argv[++i];
    else if (a === '--dry') opts.dry = true;
    else if (a === '--skills-only') opts.skillsOnly = true;
    else if (a === '--agents-only') opts.agentsOnly = true;
    else if (a === '--help' || a === '-h') opts.help = true;
    else throw new Error(`不明な引数: ${a}`);
  }

  return opts;
}

/**
 * @param {string} dir
 * @param {(filePath: string) => boolean} filter
 * @returns {string[]}
 */
function walkFiles(dir, filter) {
  if (!existsSync(dir)) return [];
  const out = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkFiles(full, filter));
    } else if (entry.isFile() && filter(full)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * 対象ルートからエージェント md を列挙
 * @param {string} root
 */
export function collectAgentFiles(root) {
  // root 自体を走査（templates/・packages/・.claude/ いずれでも /agents/ 配下を拾う）
  const candidates = [root];

  const files = new Set();
  for (const base of candidates) {
    if (!existsSync(base)) continue;
    for (const f of walkFiles(base, (p) => {
      if (!p.endsWith('.md')) return false;
      // agents 配下のみ（dod 等を除外）
      const norm = p.replace(/\\/g, '/');
      if (!/\/agents\//.test(norm)) return false;
      return true;
    })) {
      files.add(f);
    }
  }
  return [...files].sort();
}

/**
 * 対象ルートからスキル md を列挙
 * @param {string} root
 */
export function collectSkillFiles(root) {
  const candidates = [
    join(root, 'skills'),
    join(root, 'commands'),
    join(root, '.claude', 'commands'),
    join(root, 'templates', 'skills'),
  ];

  // root 自体が skills/ の場合
  if (existsSync(root) && statSync(root).isDirectory()) {
    candidates.push(root);
  }

  const files = new Set();
  for (const base of candidates) {
    if (!existsSync(base)) continue;
    for (const f of walkFiles(base, (p) => {
      const baseName = p.split(/[/\\]/).pop() || '';
      return baseName.startsWith('ai-team-') && baseName.endsWith('.md');
    })) {
      files.add(f);
    }
  }
  return [...files].sort();
}

/**
 * 1 ファイルにプロファイルを適用
 * @param {string} filePath
 * @param {{ performanceId: string, effortId: string, kind: 'agent' | 'skill', dry?: boolean }} opts
 */
export function applyToFile(filePath, { performanceId, effortId, kind, dry = false }) {
  const original = readFileSync(filePath, 'utf-8');
  let name = extractFrontmatterName(original);

  // テンプレートプレースホルダ
  if (!name || name.includes('{{')) {
    // ファイル名から推定
    const base = filePath.split(/[/\\]/).pop().replace(/\.md$/, '');
    name = base.startsWith('_') ? base : base;
  }

  // _agent-template は role を worker 既定で埋め、create 時に差し替え可能
  if (name === '_agent-template' || name === '{{agent_id}}') {
    name = '_agent-template';
  }

  const role = name === '_agent-template' ? 'worker' : resolveRole(name, kind);
  const model = resolveModel(performanceId, role);
  const effort = resolveEffort(effortId);

  const { content, changed } = upsertModelEffortFrontmatter(original, {
    model,
    effort,
    modelRole: role,
  });

  if (changed && !dry) {
    writeFileSync(filePath, content, 'utf-8');
  }

  return { filePath, name, role, model, effort, changed };
}

/**
 * @param {{
 *   performanceId?: string,
 *   effortId?: string,
 *   root: string,
 *   dry?: boolean,
 *   skillsOnly?: boolean,
 *   agentsOnly?: boolean,
 * }} options
 */
export function applyModelProfile(options) {
  const performanceId = options.performanceId ?? DEFAULT_PERFORMANCE_PROFILE;
  const effortId = options.effortId ?? DEFAULT_EFFORT_PROFILE;
  const root = resolve(options.root);
  const dry = options.dry ?? false;

  if (!PERFORMANCE_PROFILES[performanceId]) {
    throw new Error(
      `不明な性能プロファイル: ${performanceId}（候補: ${Object.keys(PERFORMANCE_PROFILES).join(', ')}）`
    );
  }
  if (!EFFORT_PROFILES[effortId]) {
    throw new Error(
      `不明な effort プロファイル: ${effortId}（候補: ${Object.keys(EFFORT_PROFILES).join(', ')}）`
    );
  }

  const results = [];

  if (!options.skillsOnly) {
    for (const file of collectAgentFiles(root)) {
      results.push(applyToFile(file, { performanceId, effortId, kind: 'agent', dry }));
    }
  }
  if (!options.agentsOnly) {
    for (const file of collectSkillFiles(root)) {
      results.push(applyToFile(file, { performanceId, effortId, kind: 'skill', dry }));
    }
  }

  return {
    performanceId,
    effortId,
    root,
    dry,
    results,
    changedCount: results.filter((r) => r.changed).length,
  };
}

function printHelp() {
  console.log(`使い方:
  node bin/lib/apply-model-profile.js --profile <id> --effort <id> --dir <path>

性能プロファイル (--profile):
${Object.values(PERFORMANCE_PROFILES)
  .map((p) => `  ${p.id.padEnd(18)} ${p.label} — ${p.description}`)
  .join('\n')}

effort プロファイル (--effort):
${Object.values(EFFORT_PROFILES)
  .map((p) => `  ${p.id.padEnd(18)} ${p.label} — ${p.description}`)
  .join('\n')}

オプション:
  --dir, -d         適用対象ルート（例: templates / .claude / .）
  --dry             書き込まず差分候補のみ表示
  --agents-only     エージェント md のみ
  --skills-only     スキル md のみ
  --help, -h        ヘルプ

例:
  node bin/lib/apply-model-profile.js --profile balance --effort normal --dir templates
  node bin/lib/apply-model-profile.js --profile high-performance --effort deep --dir .claude
`);
}

// CLI エントリ
const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  try {
    const opts = parseArgs();
    if (opts.help) {
      printHelp();
      process.exit(0);
    }
    if (!opts.dir) {
      console.error('エラー: --dir を指定してください');
      printHelp();
      process.exit(1);
    }

    const root = resolve(packageRoot, opts.dir);
    const report = applyModelProfile({
      performanceId: opts.profile,
      effortId: opts.effort,
      root,
      dry: opts.dry,
      skillsOnly: opts.skillsOnly,
      agentsOnly: opts.agentsOnly,
    });

    console.log(
      `${report.dry ? '🔍 ドライラン' : '✅ 適用完了'}: profile=${report.performanceId} effort=${report.effortId}`
    );
    console.log(`対象: ${report.root}`);
    console.log(`変更: ${report.changedCount} / ${report.results.length} ファイル\n`);

    for (const r of report.results) {
      const mark = r.changed ? (report.dry ? '・' : '✓') : '·';
      const rel = relative(packageRoot, r.filePath);
      console.log(
        `  ${mark} ${rel}  [${r.role}] model=${r.model} effort=${r.effort}${r.changed ? '' : ' (変更なし)'}`
      );
    }
  } catch (err) {
    console.error(`エラー: ${err.message}`);
    process.exit(1);
  }
}
