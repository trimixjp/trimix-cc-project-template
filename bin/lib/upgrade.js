/**
 * upgrade コマンド実装
 *
 * 導入済みのAIチーム定義・共通設定・skills を最新テンプレートへ更新する。
 * templates/ と skills/ を正源（SSOT）とし、cwd の .claude/ 配下へ反映する。
 *
 * 安全設計:
 *  - 適用前に必ず createBackup() で退避する。バックアップが失敗したら
 *    適用を実行せず終了コード1で停止する（fail-closed）。
 *  - バックアップ対象は「upgrade が書き込む可能性のある全ファイル」であり、
 *    差分の有無では絞らない。差分検出のバグでバックアップが漏れる事故を防ぐため、
 *    安全側に倒す。
 *  - 非対話環境では --yes が無い限り中止する（後述の confirmProceed 参照）。
 */

import {
  existsSync, statSync, readdirSync, readFileSync, mkdirSync, copyFileSync
} from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';

import { SKILL_FILES } from './skill-files.js';
import { isCustomized } from './plugin-install.js';
import {
  createBackup, ensureGitignore, printBackupIntro, printBackupSummary
} from './backup.js';
import { checkPluginUpdates, printUpdateNotice } from './version-check.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, '../..');

/** @trimix/ai-team のバージョンを package.json から読む */
function readPackageVersion() {
  const pkg = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf-8'));
  return pkg.version;
}

/**
 * テンプレート上の既知チーム一覧を返す（templates/teams/*、`_` 始まりは除外）。
 */
export function knownTeams() {
  const teamsDir = join(packageRoot, 'templates', 'teams');
  if (!existsSync(teamsDir)) return [];
  return readdirSync(teamsDir)
    .filter((name) => !name.startsWith('_'))
    .filter((name) => statSync(join(teamsDir, name)).isDirectory())
    .sort();
}

/**
 * cwd に導入済みのチーム一覧を返す。
 * .claude/teams/<team>/ が存在し、かつ既知チーム（テンプレートが存在する）であるもの。
 * ai-team-plugins.json に依存しないのは、テンプレート同梱配布のチーム（sns/youtube）が
 * そこに記録されない場合でも取りこぼさないため。
 */
export function installedTeams(cwd) {
  return knownTeams().filter((team) =>
    existsSync(join(cwd, '.claude', 'teams', team))
  );
}

/** srcDir 配下のファイルを再帰列挙し、{ src, dest } を out に push する（.gitkeep は除外） */
function collectDir(srcDir, destRel, out) {
  if (!existsSync(srcDir)) return;
  for (const entry of readdirSync(srcDir)) {
    if (entry === '.gitkeep') continue;
    const srcPath = join(srcDir, entry);
    if (statSync(srcPath).isDirectory()) {
      collectDir(srcPath, join(destRel, entry), out);
    } else {
      out.push({ src: srcPath, dest: join(destRel, entry) });
    }
  }
}

/** 単一ファイルを { src, dest } として out に push する（テンプレートに存在する場合のみ） */
function collectFile(srcPath, destRel, out) {
  if (existsSync(srcPath)) out.push({ src: srcPath, dest: destRel });
}

/**
 * チームの plugin.json を読み込む。
 * packages/workflow-<team>/plugin.json を単一の正として参照する。
 * @returns {object|null} plugin.json の内容。存在しなければ null。
 */
function loadTeamPlugin(team) {
  const pluginJsonPath = join(packageRoot, 'packages', `workflow-${team}`, 'plugin.json');
  if (!existsSync(pluginJsonPath)) return null;
  const raw = readFileSync(pluginJsonPath, 'utf-8');
  try {
    return JSON.parse(raw);
  } catch (e) {
    // どの plugin.json が壊れているのかを示す。生の SyntaxError スタックトレースだけでは
    // 不正なファイルの特定に手間がかかるため、パスを添えて再送出する（R-5）。
    throw new Error(`plugin.json の解析に失敗しました: ${pluginJsonPath}（${e.message}）`);
  }
}

/**
 * チームの plugin.json の install マップから、upgrade 対象の { src, dest } を列挙する。
 *
 * install マップの各エントリは「パッケージ相対の元パス → 配置先」を表す。
 *  - 元パス（キー）は `templates/...` 始まり。`templates/` を剥がすと SSOT
 *    （リポジトリの templates/teams/<team>/...）に 1:1 で対応する。
 *    packages/workflow-<team>/templates は SHA-256 一致が強制されるミラーなので、
 *    どちらを読んでも内容は同一。ここでは SSOT を正源として読む。
 *  - 配置先（値）が `.claude/` 配下でないもの（github/ISSUE_TEMPLATE 等の
 *    リポジトリ設定）は upgrade の対象外とし、excluded に記録する（黙って落とさない）。
 *
 * @param {string} team
 * @param {{ src: string, dest: string }[]} out         upgrade 対象の蓄積先
 * @param {{ team: string, srcPattern: string, destDir: string }[]} excluded 対象外の蓄積先
 */
function collectTeamTargetsFromPlugin(team, out, excluded) {
  const plugin = loadTeamPlugin(team);
  if (!plugin || !plugin.install) {
    // 既知チームは Task 1 で必ずパッケージを持つため通常ここには来ない。
    // 万一欠落していても黙って全消しにせず、警告して当該チームをスキップする。
    console.log(`  ⚠️  ${team}: packages/workflow-${team}/plugin.json が見つからないため、このチームの更新対象を導出できません`);
    return;
  }

  const teamBase = join(packageRoot, 'templates', 'teams', team);

  for (const [srcPattern, destDir] of Object.entries(plugin.install)) {
    // .claude/ 配下でない配置先はリポジトリ設定（upgrade 対象外）
    if (!destDir.startsWith('.claude/')) {
      excluded.push({ team, srcPattern, destDir });
      continue;
    }

    // install マップの元パスは `templates/...`。SSOT の teams/<team>/... へ対応付ける。
    const sub = srcPattern.replace(/^templates\//, '');
    if (sub.includes('*')) {
      // ワイルドカード: `*` の前をディレクトリとして再帰列挙する
      const dir = sub.slice(0, sub.indexOf('*')).replace(/\/$/, '');
      const destBase = destDir.replace(/\/$/, '');
      collectDir(join(teamBase, dir), destBase, out);
    } else {
      // 単一ファイル
      collectFile(join(teamBase, sub), destDir, out);
    }
  }
}

/**
 * アップグレードで書き込む可能性のある { src, dest } ペアを列挙する。
 * dest は cwd からの相対パス。列挙対象はすべて .claude/ 配下に収まる。
 *
 * グローバル対象（共有エージェント・escalation-rules・model-profiles・skills）は
 * team_id 指定の有無にかかわらず常に含める。これらはチーム横断の共通設定であり、
 * バージョンにまとめて追随させる方が安全と判断したため。
 *
 * チーム別対象は各チームの plugin.json の install マップを単一の正として導出する
 * （ファイル種別のハードコードはしない）。これにより content の compliance-rules や
 * youtube の PRODUCTION-GUIDE.md など、チーム固有のファイルも取りこぼさない。
 * github/ISSUE_TEMPLATE 等の .claude/ 外のリポジトリ設定は対象外とし、
 * excludedRepoConfig に記録して実行時に明示する。
 *
 * @param {{ teams: string[] }} opts
 * @returns {{ targets: {src,dest}[], excludedRepoConfig: {team,srcPattern,destDir}[] }}
 */
export function enumerateUpgradeTargets({ teams }) {
  const targets = [];
  const excludedRepoConfig = [];
  const T = join(packageRoot, 'templates');

  // --- グローバル（常に対象） ---
  collectDir(join(T, '_shared', 'agents'), join('.claude', 'agents'), targets);
  collectFile(join(T, '_shared', 'escalation-rules.yml'), join('.claude', 'escalation-rules.yml'), targets);
  collectFile(join(T, '_shared', 'model-profiles.yml'), join('.claude', 'model-profiles.yml'), targets);
  for (const file of SKILL_FILES) {
    collectFile(join(packageRoot, 'skills', file), join('.claude', 'commands', file), targets);
  }

  // --- チーム別（plugin.json の install マップ由来） ---
  for (const team of teams) {
    collectTeamTargetsFromPlugin(team, targets, excludedRepoConfig);
  }

  return { targets, excludedRepoConfig };
}

/**
 * 各 { src, dest } を差分カテゴリに分類する。
 *   'new'       … dest が存在しない（新規作成される）
 *   'update'    … 内容が異なり上書きされる
 *   'protected' … dest がカスタマイズ済み（# customized: true）で --force なし → スキップ
 *   'same'      … 内容が同一（変更なし）
 *
 * @param {{ cwd: string, targets: {src,dest}[], force: boolean }} opts
 * @returns {{ src, dest, category }[]}
 */
export function diffTargets({ cwd, targets, force }) {
  return targets.map(({ src, dest }) => {
    const destAbs = join(cwd, dest);
    if (!existsSync(destAbs)) return { src, dest, category: 'new' };
    // Buffer 比較で内容の同一性を判定する（テンプレートは小さいため全読みで十分）
    const same = readFileSync(src).equals(readFileSync(destAbs));
    if (same) return { src, dest, category: 'same' };
    if (!force && isCustomized(destAbs)) return { src, dest, category: 'protected' };
    return { src, dest, category: 'update' };
  });
}

/**
 * 差分に基づいてテンプレートを適用する。'protected' と 'same' はスキップする。
 * @param {{ cwd: string, diffs: {src,dest,category}[] }} opts
 * @returns {{ applied: string[], skippedProtected: string[], unchanged: string[] }}
 */
export function applyUpgrade({ cwd, diffs }) {
  const applied = [];
  const skippedProtected = [];
  const unchanged = [];
  for (const d of diffs) {
    if (d.category === 'protected') { skippedProtected.push(d.dest); continue; }
    if (d.category === 'same') { unchanged.push(d.dest); continue; }
    const destAbs = join(cwd, d.dest);
    mkdirSync(dirname(destAbs), { recursive: true });
    copyFileSync(d.src, destAbs);
    applied.push(d.dest);
  }
  return { applied, skippedProtected, unchanged };
}

/** 差分の内訳を表示する */
function printDiff(diffs) {
  const news = diffs.filter((d) => d.category === 'new');
  const updates = diffs.filter((d) => d.category === 'update');
  const protectedItems = diffs.filter((d) => d.category === 'protected');
  const same = diffs.filter((d) => d.category === 'same');

  console.log('');
  console.log('  📊 差分:');
  console.log(`     新規作成: ${news.length} 件`);
  console.log(`     上書き更新: ${updates.length} 件`);
  console.log(`     保護のためスキップ（カスタマイズ済み）: ${protectedItems.length} 件`);
  console.log(`     変更なし: ${same.length} 件`);

  if (updates.length > 0) {
    console.log('');
    console.log('  ✏️  上書き更新されるファイル:');
    for (const d of updates) console.log(`     - ${d.dest}`);
  }
  if (news.length > 0) {
    console.log('');
    console.log('  ➕ 新規作成されるファイル:');
    for (const d of news) console.log(`     - ${d.dest}`);
  }
  if (protectedItems.length > 0) {
    console.log('');
    console.log('  🛡️  保護のためスキップ（--force で上書き可能）:');
    for (const d of protectedItems) console.log(`     - ${d.dest}`);
  }
}

/**
 * upgrade の対象外にした .claude/ 外のリポジトリ設定（github/ISSUE_TEMPLATE 等）を明示する。
 * 黙って落とすと「更新されない理由」が分からず事故につながるため、必ず出力する。
 */
function printExcludedRepoConfig(excluded) {
  if (!excluded || excluded.length === 0) return;
  console.log('');
  console.log('  ℹ️  以下は .claude/ 外のリポジトリ設定のため upgrade の対象外です（更新するには /ai-team-setup で再配置してください）:');
  // 同一配置先が複数チームで重複するため、配置先単位で集約して表示する
  const byDest = new Map();
  for (const e of excluded) {
    if (!byDest.has(e.destDir)) byDest.set(e.destDir, new Set());
    byDest.get(e.destDir).add(e.team);
  }
  for (const [destDir, teamSet] of byDest) {
    console.log(`     - ${destDir}（${[...teamSet].sort().join(', ')}）`);
  }
}

/** 対話プロンプトで y/N を尋ねる */
function askYesNo(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(/^y(es)?$/i.test(answer.trim()));
    });
  });
}

/**
 * アップグレード適用の可否をユーザーに確認する。
 *
 * 非対話環境（stdin が TTY でない = パイプ・CI など）では、確認応答を取得できない。
 * 破壊的な上書きを無確認で走らせないため、明示フラグ --yes が無い限り安全側に倒して
 * 中止する。--yes を付けた場合のみ、意図的な続行とみなして確認を省略する。
 *
 * @returns {Promise<boolean>} true なら適用を続行してよい
 */
async function confirmProceed({ yes }) {
  if (yes) return true;
  if (!process.stdin.isTTY) {
    console.error('');
    console.error('⚠️  非対話環境のため確認を取得できません。安全のためアップグレードを中止します。');
    console.error('   意図的に続行する場合は --yes を付けて再実行してください。');
    return false;
  }
  return askYesNo('\nこの内容でアップグレードを適用しますか？ [y/N]: ');
}

/**
 * upgrade コマンドの本体。
 * process.exit は呼ばず、終了コードを number で返す（setup.js 側で exit する）。
 * これにより単体テストからも安全に呼び出せる。
 *
 * @param {string[]} args  'upgrade' を除いた引数配列
 * @param {{ cwd: string }} ctx
 * @returns {Promise<number>} 終了コード
 */
export async function runUpgrade(args, { cwd }) {
  const isDry = args.includes('--dry');
  const force = args.includes('--force');
  const yes = args.includes('--yes');
  const teamArg = args.find((a) => !a.startsWith('--')); // 最初の非フラグ引数を team_id とみなす

  // 対象チームの決定
  if (teamArg && !knownTeams().includes(teamArg)) {
    console.error(`❌ エラー: 不明なチームID "${teamArg}"`);
    console.error(`   指定可能: ${knownTeams().join(' / ') || '(なし)'}`);
    return 1;
  }
  const teams = teamArg ? [teamArg] : installedTeams(cwd);

  console.log('');
  console.log('🔄 @trimix/ai-team upgrade');
  console.log(`   対象チーム: ${teams.length > 0 ? teams.join(', ') : '(なし)'}`);
  if (isDry) console.log('   モード: --dry（差分の提示のみ。書き込み・バックアップは行いません）');
  if (force) console.log('   モード: --force（カスタマイズ済みファイルも上書きします）');

  // 導入済みプラグインと registry のバージョン差を通知する（更新の気づきを与える）
  printUpdateNotice(checkPluginUpdates(cwd));

  // 1. 対象ファイルの列挙（グローバル + 選択チーム。plugin.json の install マップ由来）
  const { targets, excludedRepoConfig } = enumerateUpgradeTargets({ teams });
  printExcludedRepoConfig(excludedRepoConfig);
  if (targets.length === 0) {
    console.log('');
    console.log('ℹ️  更新対象のテンプレートが見つかりませんでした。');
    return 0;
  }

  // 2. 差分の提示
  const diffs = diffTargets({ cwd, targets, force });
  printDiff(diffs);

  // 3. --dry ならここで終了（書き込みもバックアップも行わない）
  if (isDry) {
    console.log('');
    console.log('🔍 --dry のため、ここで終了します（何も書き込んでいません）。');
    return 0;
  }

  // 適用する差分（new/update）が無ければ、バックアップも確認も不要で終了
  const writes = diffs.filter((d) => d.category === 'new' || d.category === 'update');
  if (writes.length === 0) {
    console.log('');
    console.log('✅ すべて最新です。適用する差分はありません。');
    return 0;
  }

  // 4. ユーザー確認
  const proceed = await confirmProceed({ yes });
  if (!proceed) {
    console.log('');
    console.log('🚫 アップグレードを中止しました。');
    return 0;
  }

  // 5. バックアップ（fail-closed）。差分の有無で絞らず、書き込む可能性のある全対象を退避する。
  printBackupIntro();
  let backup;
  try {
    backup = createBackup({
      cwd,
      targets: targets.map((t) => t.dest),
      packageVersion: readPackageVersion()
    });
  } catch (e) {
    console.error('');
    console.error(`❌ バックアップに失敗したため、アップグレードを中止します: ${e.message}`);
    console.error('   （fail-closed: バックアップできない状態での上書きは行いません）');
    return 1;
  }
  // .gitignore への追記はバックアップ成功後に行う。バックアップ失敗で fail-closed 中止した
  // ときに、.gitignore へ `.ai-team-backups/` 行を残す副作用を防ぐため（R-4）。
  ensureGitignore(cwd);
  printBackupSummary(backup);

  // 6. 適用
  const result = applyUpgrade({ cwd, diffs });

  // 7. 結果表示
  console.log('');
  console.log('✅ アップグレードが完了しました。');
  console.log(`   更新: ${result.applied.length} 件`);
  console.log(`   保護スキップ: ${result.skippedProtected.length} 件`);
  console.log(`   変更なし: ${result.unchanged.length} 件`);
  if (result.skippedProtected.length > 0) {
    console.log('');
    console.log('  ℹ️  カスタマイズ済みのため保護したファイルがあります。上書きするには --force を付けて再実行してください:');
    for (const dest of result.skippedProtected) console.log(`     - ${dest}`);
  }
  return 0;
}
