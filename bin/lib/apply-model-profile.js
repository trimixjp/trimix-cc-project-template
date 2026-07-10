/**
 * モデル・effort プロファイルをエージェント / スキル md に反映する。
 *
 * 使い方:
 *   node bin/lib/apply-model-profile.js --runtime claude-code --profile balance --effort normal --dir templates
 *   node bin/lib/apply-model-profile.js --runtime grok --profile balance --effort normal --dir .claude --mirror-grok
 *   node bin/lib/apply-model-profile.js --dry --profile balance --effort normal --dir templates
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, copyFileSync, statSync } from 'fs';
import { join, relative, resolve, dirname, basename, sep } from 'path';
import { fileURLToPath } from 'url';
import { recordFiles } from './baseline.js';
import {
  PERFORMANCE_PROFILES,
  EFFORT_PROFILES,
  RUNTIMES,
  DEFAULT_PERFORMANCE_PROFILE,
  DEFAULT_EFFORT_PROFILE,
  DEFAULT_RUNTIME,
  resolveRole,
  resolveModel,
  resolveEffort,
  normalizeRuntime,
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
    runtime: DEFAULT_RUNTIME,
    profile: DEFAULT_PERFORMANCE_PROFILE,
    effort: DEFAULT_EFFORT_PROFILE,
    dir: null,
    dry: false,
    skillsOnly: false,
    agentsOnly: false,
    mirrorGrok: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--runtime' || a === '-r') opts.runtime = argv[++i];
    else if (a === '--profile' || a === '-p') opts.profile = argv[++i];
    else if (a === '--effort' || a === '-e') opts.effort = argv[++i];
    else if (a === '--dir' || a === '-d') opts.dir = argv[++i];
    else if (a === '--dry') opts.dry = true;
    else if (a === '--skills-only') opts.skillsOnly = true;
    else if (a === '--agents-only') opts.agentsOnly = true;
    else if (a === '--mirror-grok') opts.mirrorGrok = true;
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
export function applyToFile(filePath, { performanceId, effortId, kind, runtimeId = DEFAULT_RUNTIME, dry = false }) {
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
  const model = resolveModel(performanceId, role, runtimeId);
  const effort = resolveEffort(effortId, runtimeId);

  const { content, changed } = upsertModelEffortFrontmatter(original, {
    model,
    effort,
    modelRole: role,
  });

  if (changed && !dry) {
    writeFileSync(filePath, content, 'utf-8');
  }

  return { filePath, name, role, model, effort, runtimeId, changed };
}

/**
 * Grok 用にエージェント md を `.grok/agents/` へフラットコピーする。
 * 同一 name の衝突時は `<team>-<name>.md` にする。
 *
 * @param {string} projectRoot  プロジェクトルート（.claude と .grok の親）
 * @param {{ dry?: boolean }} [opts]
 */
export function mirrorAgentsToGrok(projectRoot, opts = {}) {
  const dry = opts.dry ?? false;
  const claudeRoot = join(projectRoot, '.claude');
  const destDir = join(projectRoot, '.grok', 'agents');
  const sources = collectAgentFiles(claudeRoot);
  const used = new Set();
  const copied = [];

  if (!dry) mkdirSync(destDir, { recursive: true });

  for (const src of sources) {
    const content = readFileSync(src, 'utf-8');
    let name = extractFrontmatterName(content) || basename(src, '.md');
    if (name.includes('{{') || name.startsWith('_')) continue;

    // チーム名をパスから推定: .claude/teams/<team>/agents/foo.md
    const norm = src.replace(/\\/g, '/');
    const teamMatch = norm.match(/\/teams\/([^/]+)\/agents\//);
    const team = teamMatch ? teamMatch[1] : null;

    let fileBase = name;
    if (used.has(fileBase) && team) {
      fileBase = `${team}-${name}`;
    }
    used.add(fileBase);

    const dest = join(destDir, `${fileBase}.md`);
    if (!dry) copyFileSync(src, dest);
    copied.push({ src, dest, name: fileBase });
  }

  // 共有エージェント
  // collectAgentFiles が既に .claude/agents も含む

  // skills → .grok/commands（Claude 互換に加え明示配置）
  const cmdSrc = join(projectRoot, '.claude', 'commands');
  const cmdDest = join(projectRoot, '.grok', 'commands');
  const skillCopies = [];
  if (existsSync(cmdSrc)) {
    if (!dry) mkdirSync(cmdDest, { recursive: true });
    for (const f of readdirSync(cmdSrc)) {
      if (!f.endsWith('.md')) continue;
      const s = join(cmdSrc, f);
      const d = join(cmdDest, f);
      if (!dry) copyFileSync(s, d);
      skillCopies.push({ src: s, dest: d });
    }
  }

  return { agents: copied, skills: skillCopies };
}

/**
 * frontmatter を書き換えた結果のうち、`.claude/` 配下のファイルを baseline へ記録する（#85・経路4）。
 *
 * プロジェクトルート（`.claude` の親）単位でまとめて記録する。`--dir templates` のようにテンプレート
 * へ適用した場合は `.claude/` パスが現れないため、何も記録しない（開発リポジトリの誤記録を防ぐ）。
 *
 * @param {{ filePath: string, changed: boolean }[]} results applyToFile の戻り値の配列
 */
function recordChangedToBaseline(results) {
  const byProject = new Map(); // projectRoot(絶対) -> string[]（cwd 相対・POSIX）
  for (const r of results) {
    if (!r.changed) continue;
    const norm = r.filePath.split(sep).join('/');
    const idx = norm.indexOf('/.claude/');
    if (idx === -1) continue; // .claude 配下でない（templates/ 等）は記録しない
    const projectRoot = r.filePath.slice(0, idx); // '/.claude/' の直前まで（絶対パス）
    const rel = norm.slice(idx + 1);              // '.claude/...' 部分
    if (!byProject.has(projectRoot)) byProject.set(projectRoot, []);
    byProject.get(projectRoot).push(rel);
  }
  for (const [projectRoot, rels] of byProject) {
    try {
      recordFiles(projectRoot, rels);
    } catch { /* baseline 記録の失敗はプロファイル適用の成否に影響させない */ }
  }
}

/**
 * @param {{
 *   performanceId?: string,
 *   effortId?: string,
 *   runtimeId?: string,
 *   root: string,
 *   dry?: boolean,
 *   skillsOnly?: boolean,
 *   agentsOnly?: boolean,
 *   mirrorGrok?: boolean,
 *   projectRoot?: string,
 * }} options
 */
export function applyModelProfile(options) {
  const performanceId = options.performanceId ?? DEFAULT_PERFORMANCE_PROFILE;
  const effortId = options.effortId ?? DEFAULT_EFFORT_PROFILE;
  const runtimeId = normalizeRuntime(options.runtimeId ?? DEFAULT_RUNTIME);
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
      results.push(applyToFile(file, { performanceId, effortId, runtimeId, kind: 'agent', dry }));
    }
  }
  if (!options.agentsOnly) {
    for (const file of collectSkillFiles(root)) {
      results.push(applyToFile(file, { performanceId, effortId, runtimeId, kind: 'skill', dry }));
    }
  }

  // frontmatter を書き換えたファイルのうち .claude/ 配下のものは、その内容を baseline へ記録する
  // （#85・経路4）。これをしないと、プロファイル適用直後から全ファイルが「編集済み」に見え、
  // 次回 upgrade で保護されて更新されなくなる。テンプレート（templates/ 配下）への適用や --dry では
  // .claude パスが現れないため記録は起きない。
  if (!dry) {
    recordChangedToBaseline(results);
  }

  let mirror = null;
  if (options.mirrorGrok || runtimeId === 'grok') {
    const projectRoot = options.projectRoot || (basename(root) === '.claude' ? dirname(root) : root);
    // root が .claude のとき親を project root とみなす
    const pr =
      existsSync(join(projectRoot, '.claude'))
        ? projectRoot
        : existsSync(join(root, 'agents')) && basename(root) === '.claude'
          ? dirname(root)
          : projectRoot;
    if (existsSync(join(pr, '.claude'))) {
      mirror = mirrorAgentsToGrok(pr, { dry });
    }
  }

  return {
    performanceId,
    effortId,
    runtimeId,
    root,
    dry,
    results,
    changedCount: results.filter((r) => r.changed).length,
    mirror,
  };
}

function printHelp() {
  console.log(`使い方:
  node bin/lib/apply-model-profile.js --runtime <id> --profile <id> --effort <id> --dir <path>

runtime (--runtime):
${Object.values(RUNTIMES)
  .map((r) => `  ${r.id.padEnd(18)} ${r.label} — ${r.description}`)
  .join('\n')}

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
  --runtime, -r     claude-code | grok（既定: claude-code）
  --mirror-grok     runtime に関わらず .grok/agents へミラー
  --dry             書き込まず差分候補のみ表示
  --agents-only     エージェント md のみ
  --skills-only     スキル md のみ
  --help, -h        ヘルプ

例:
  node bin/lib/apply-model-profile.js --runtime claude-code --profile balance --effort normal --dir templates
  node bin/lib/apply-model-profile.js --runtime grok --profile balance --effort normal --dir .claude
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
      runtimeId: opts.runtime,
      root,
      dry: opts.dry,
      skillsOnly: opts.skillsOnly,
      agentsOnly: opts.agentsOnly,
      mirrorGrok: opts.mirrorGrok,
    });

    console.log(
      `${report.dry ? '🔍 ドライラン' : '✅ 適用完了'}: runtime=${report.runtimeId} profile=${report.performanceId} effort=${report.effortId}`
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

    if (report.mirror) {
      console.log(
        `\nGrok ミラー: agents=${report.mirror.agents.length} skills=${report.mirror.skills.length}${report.dry ? ' (dry)' : ''}`
      );
    }
  } catch (err) {
    console.error(`エラー: ${err.message}`);
    process.exit(1);
  }
}
