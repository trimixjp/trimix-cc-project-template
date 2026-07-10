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
import { unifiedDiff } from './diff.js';
import {
  createBackup, ensureGitignore, printBackupIntro, printBackupSummary
} from './backup.js';
import { checkPluginUpdates, printUpdateNotice } from './version-check.js';
import { firstSymlinkInPath, hardlinkNlink, irregularFileType, fileTypeLabel } from './link-safety.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, '../..');

/**
 * 書き込み先 rel（cwd 相対）へ安全に書き込めるかを検査する（R-1）。
 *
 * 3 段階で検査する:
 *  1. 封じ込め: cwd から rel まで各パス要素を1つずつ降り、途中にシンボリックリンクが
 *     1つでもあれば不許可。葉（最終要素）だけでなく中間ディレクトリのリンクも辿られる
 *     （mkdirSync(recursive) / copyFileSync が辿る）ため、必ずパス全体を走査する。
 *     壊れたリンクも lstatSync で検出できる。.claude/ の内側で完結するリンクも一律で
 *     不許可とする（安全側に倒し、内外の判別は試みない）。
 *  2. ハードリンク: rel 自体が nlink > 1 の通常ファイルなら不許可（copyFileSync が共有
 *     inode を上書きして外部ファイルを破壊するため）。
 *  3. 通常ファイル以外: rel 自体がディレクトリ / FIFO / ソケット / デバイスファイル等の
 *     「通常ファイルでない実体」なら不許可（#84）。copyFileSync / readFileSync は通常ファイルを
 *     前提としており、ディレクトリなら EISDIR、FIFO ならブロック（ハング）、デバイスなら
 *     想定外の副作用を招く。ディレクトリだけを個別に直すのではなく、「通常ファイルでない
 *     ものはすべて」一律スキップして明示する（インシデント #4 の教訓1・7）。
 *
 * 違反があれば skip 記述子を返す。安全に書ける場合は null。
 *
 * @param {string} cwd
 * @param {string} rel cwd からの相対パス
 * @returns {{ rel: string, kind: 'symlink', linkRel: string, target: string }
 *          | { rel: string, kind: 'hardlink', nlink: number }
 *          | { rel: string, kind: 'irregular', fileType: string }
 *          | null}
 */
function inspectDest(cwd, rel) {
  const link = firstSymlinkInPath(cwd, rel);
  if (link) {
    return { rel, kind: 'symlink', linkRel: link.rel, target: link.target };
  }
  const abs = join(cwd, rel);
  const nlink = hardlinkNlink(abs);
  if (nlink) {
    return { rel, kind: 'hardlink', nlink };
  }
  const irregular = irregularFileType(abs);
  if (irregular) {
    return { rel, kind: 'irregular', fileType: irregular.fileType };
  }
  return null;
}

/**
 * 保護ファイルの隣に書き出す <dest>.new（cwd 相対）へ安全に書き込めるかを検査する（R-1）。
 * <dest>.new も本体（dest）と同様に copyFileSync で書き出すため、検査内容は inspectDest と
 * 同一である。すなわち封じ込め（経路のシンボリックリンク）・ハードリンク（nlink>1）に加えて、
 * 通常ファイル以外（ディレクトリ / FIFO / ソケット / デバイス）も検査する。経路上のリンクを
 * 辿れば .claude/ の外を、ハードリンクなら共有 inode を copyFileSync が破壊し、ディレクトリなら
 * EISDIR、FIFO ならハングを招くため、いずれの場合も辿らず（触れず）スキップする。
 * 違反があれば skip 記述子、無ければ null。
 *
 * @param {string} cwd
 * @param {string} newRel `${dest}.new`
 * @returns {{ rel: string, kind: 'symlink', linkRel: string, target: string }
 *          | { rel: string, kind: 'hardlink', nlink: number }
 *          | { rel: string, kind: 'irregular', fileType: string }
 *          | null}
 */
function inspectNew(cwd, newRel) {
  return inspectDest(cwd, newRel);
}

/**
 * skip 記述子を1行の説明文に整形する。シンボリックリンク・ハードリンク・通常ファイル以外
 * （ディレクトリ / FIFO 等）を区別し、リンク先パス（symlink）・nlink（hardlink）・種別
 * （irregular）を明示する（silent cap の禁止）。葉ではなく祖先ディレクトリがリンクの場合は、
 * どの要素がリンクなのかも示す。
 *
 * @param {{rel, kind, linkRel?, target?, nlink?, fileType?}} s
 * @returns {string}
 */
function formatSkip(s) {
  if (s.kind === 'hardlink') {
    return `${s.rel}: ハードリンク（外部 inode を共有・nlink=${s.nlink}）`;
  }
  if (s.kind === 'irregular') {
    return `${s.rel}: 通常ファイルではありません（${fileTypeLabel(s.fileType)}）`;
  }
  if (s.linkRel && s.linkRel !== s.rel) {
    return `${s.rel}: 祖先 ${s.linkRel} がシンボリックリンク → ${s.target}`;
  }
  return `${s.rel}: シンボリックリンク → ${s.target}`;
}

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
 * <pluginRoot>/packages/workflow-<team>/plugin.json を単一の正として参照する。
 * pluginRoot は既定でパッケージルート（本番経路は不変）。テストが壊れた plugin.json を
 * 差し込んで runUpgrade の fail-closed 挙動を検証できるよう、読み取り元だけを注入可能にする。
 * @param {string} team
 * @param {string} pluginRoot plugin.json を探すルート（既定: packageRoot）
 * @returns {object|null} plugin.json の内容。存在しなければ null。
 */
function loadTeamPlugin(team, pluginRoot = packageRoot) {
  const pluginJsonPath = join(pluginRoot, 'packages', `workflow-${team}`, 'plugin.json');
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
 * @param {string} pluginRoot plugin.json を探すルート（既定: packageRoot）
 */
function collectTeamTargetsFromPlugin(team, out, excluded, pluginRoot = packageRoot) {
  const plugin = loadTeamPlugin(team, pluginRoot);
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
 * @param {{ teams: string[], pluginRoot?: string }} opts
 *        pluginRoot は plugin.json を探すルート（既定: packageRoot）。本番経路は不変で、
 *        テストが壊れた plugin.json を差し込むための注入点。
 * @returns {{ targets: {src,dest}[], excludedRepoConfig: {team,srcPattern,destDir}[] }}
 */
export function enumerateUpgradeTargets({ teams, pluginRoot = packageRoot }) {
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
    collectTeamTargetsFromPlugin(team, targets, excludedRepoConfig, pluginRoot);
  }

  return { targets, excludedRepoConfig };
}

/**
 * 各 { src, dest } を差分カテゴリに分類する。
 *   'blocked'   … dest への書き込みが安全でない（R-1）。封じ込め違反（経路にシンボリック
 *                 リンク）またはハードリンク。辿らずスキップ（--force でも辿らない）。
 *                 block フィールドに skip 記述子を持つ。
 *   'new'       … dest が存在しない（新規作成される）
 *   'update'    … 内容が異なり上書きされる
 *   'protected' … dest がカスタマイズ済み（# customized: true）で --force なし → スキップ
 *   'same'      … 内容が同一（変更なし）
 *
 * @param {{ cwd: string, targets: {src,dest}[], force: boolean }} opts
 * @returns {{ src, dest, category, block? }[]}
 */
export function diffTargets({ cwd, targets, force }) {
  return targets.map(({ src, dest }) => {
    // dest への書き込みが安全か（経路のリンク・ハードリンク）を最初に検査する。
    // copyFileSync / mkdirSync(recursive) は経路上のリンクを辿って .claude/ の外を
    // 書き換えてしまうため、分類段階で 'blocked' として隔離し、以降の読み書きから外す。
    // isCustomized による --force 判定より前に置くことで、--force でも辿らない（R-1）。
    const block = inspectDest(cwd, dest);
    if (block) return { src, dest, category: 'blocked', block };
    const destAbs = join(cwd, dest);
    // ここまで来れば経路にリンクは無く、destAbs は実体（または未作成）である。
    if (!existsSync(destAbs)) return { src, dest, category: 'new' };
    // Buffer 比較で内容の同一性を判定する（テンプレートは小さいため全読みで十分）
    const same = readFileSync(src).equals(readFileSync(destAbs));
    if (same) return { src, dest, category: 'same' };
    if (!force && isCustomized(destAbs)) return { src, dest, category: 'protected' };
    return { src, dest, category: 'update' };
  });
}

/**
 * protected な差分について、`<dest>.new` を書き出す作業が必要かを判定する（冪等性の要）。
 *
 *   - `.new` が存在しない                          → true（新規に書き出す必要がある）
 *   - `.new` が存在するが最新テンプレートと内容が異なる → true（退避のうえ上書きする必要がある）
 *   - `.new` が存在し最新テンプレートと内容が同一     → false（作業不要。書き出しもバックアップもしない）
 *
 * これにより、保護ファイルが残ったまま `upgrade` を繰り返しても、内容が同じ `.new` を
 * 書き直してバックアップ世代を無限に増やす、という非冪等な挙動を防ぐ。
 * 比較は Buffer 単位（テンプレートは小さいため全読みで十分。diffTargets と同じ方式）。
 *
 * @param {string} cwd
 * @param {{ src: string, dest: string }} d
 * @returns {boolean}
 */
export function protectedNewNeedsWrite(cwd, d) {
  const newAbs = join(cwd, `${d.dest}.new`);
  if (!existsSync(newAbs)) return true;
  return !readFileSync(newAbs).equals(readFileSync(d.src));
}

/**
 * 差分に基づいてテンプレートを適用する。'same' はスキップする。
 *
 * 'protected'（カスタマイズ済み）は本体を上書きしない代わりに、最新テンプレートを
 * `<dest>.new` として隣に書き出す（dpkg の .dpkg-dist / RPM の .rpmnew と同じ方式）。
 * これにより、ユーザーは自分の編集を保ったまま新テンプレートの中身を確認し、
 * 必要な差分を手作業で取り込めるようになる。`.new` は自動削除しない（取り込みの
 * 完了はユーザーにしか判断できないため）。
 *
 * 冪等性: 既に同一内容の `.new` があるときは書き出さない（protectedNewNeedsWrite）。
 * 同じ `.new` を書き直してバックアップ世代を無駄に増やすのを避ける。
 *
 * リンク保護（R-1）: 書き込み先（dest 本体・保護ファイルの <dest>.new）が封じ込め違反
 * （経路上のシンボリックリンク）またはハードリンクの場合は、辿って .claude/ の外を
 * 書き換える／外部 inode を破壊するのを避けるため、書き込まずスキップする。当該ファイル
 * のみスキップし、他のファイルの更新は続ける。
 *
 * TOCTOU（R-1 / #4 / #84 の項目5）: diffTargets の分類（'blocked'）を鵜呑みにせず、書き込み
 * 直前に inspectDest / inspectNew を再実行する。分類から書き込みまでの間にリンク等が差し込まれても、
 * 書き込む瞬間の状態で判定する。
 *
 * 判断（#84 項目5・対応不要）: 分類〜書き込みの間、および createBackup が返す世代ディレクトリの
 * 生成〜使用の間には、なお極小の TOCTOU 窓が残る。しかしこれ以上の対策（O_NOFOLLOW / fd ベースの
 * 書き込み等）は現時点では不要と判断する。理由は (1) 悪用には cwd への既存のローカル書き込み権限が
 * 前提であり、この窓を突いても新たな権限昇格にはならない、(2) 上書きは事前に createBackup で退避
 * 済みで復元可能、(3) この「書き込み直前の再検査」により窓はミリ秒未満に最小化されている、の3点。
 * 両レビュアーが独立に MEDIUM と較正しており、現状の直前再検査で十分である。将来 fd ベースの
 * 書き込みを導入する余地は残す。
 *
 * @param {{ cwd: string, diffs: {src,dest,category,block?}[] }} opts
 * @returns {{ applied: string[], skippedProtected: string[], unchanged: string[], writtenNew: string[], skipped: object[] }}
 *   writtenNew は「実際に」書き出した `.new` の相対パス一覧（既に最新なら含まれない）。
 *   skipped はリンクのため書き込みを見送った書き込み先の skip 記述子。slot は 'dest'（本体）
 *   または 'new'（保護ファイルの .new）。
 */
export function applyUpgrade({ cwd, diffs }) {
  const applied = [];
  const skippedProtected = [];
  const unchanged = [];
  const writtenNew = [];
  const skipped = [];
  for (const d of diffs) {
    if (d.category === 'same') { unchanged.push(d.dest); continue; }

    if (d.category === 'protected') {
      skippedProtected.push(d.dest);
      const newRel = `${d.dest}.new`;
      // TOCTOU: <dest>.new の封じ込めを書き込み直前に再検査する。リンクなら辿らずスキップ（R-1）
      const newBlock = inspectNew(cwd, newRel);
      if (newBlock) {
        skipped.push({ ...newBlock, slot: 'new' });
        continue;
      }
      // 本体は維持。最新テンプレートを <dest>.new として書き出す（既に最新なら何もしない）
      if (protectedNewNeedsWrite(cwd, d)) {
        const newAbs = join(cwd, newRel);
        mkdirSync(dirname(newAbs), { recursive: true });
        copyFileSync(d.src, newAbs);
        writtenNew.push(newRel);
      }
      continue;
    }

    // 'new' / 'update'（および分類時に 'blocked' だったもの）は、書き込み直前に
    // inspectDest を再実行してから書き込む。'blocked' はここで確実にスキップされ、
    // 'new' / 'update' も TOCTOU の窓で差し込まれたリンクを弾ける（R-1 / #4）。
    const block = inspectDest(cwd, d.dest);
    if (block) {
      skipped.push({ ...block, slot: 'dest' });
      continue;
    }
    const destAbs = join(cwd, d.dest);
    mkdirSync(dirname(destAbs), { recursive: true });
    copyFileSync(d.src, destAbs);
    applied.push(d.dest);
  }
  return { applied, skippedProtected, unchanged, writtenNew, skipped };
}

/** 差分の内訳を表示する */
function printDiff(diffs) {
  const news = diffs.filter((d) => d.category === 'new');
  const updates = diffs.filter((d) => d.category === 'update');
  const protectedItems = diffs.filter((d) => d.category === 'protected');
  const same = diffs.filter((d) => d.category === 'same');
  const blocked = diffs.filter((d) => d.category === 'blocked');

  console.log('');
  console.log('  📊 差分:');
  console.log(`     新規作成: ${news.length} 件`);
  console.log(`     上書き更新: ${updates.length} 件`);
  console.log(`     保護のためスキップ（カスタマイズ済み）: ${protectedItems.length} 件`);
  console.log(`     変更なし: ${same.length} 件`);
  if (blocked.length > 0) {
    console.log(`     安全に書き込めずスキップ（リンク／通常ファイル以外）: ${blocked.length} 件`);
  }

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
 * リンクのため書き込みをスキップする書き込み先を洗い出す（R-1）。
 *
 * 2 つの経路を検査する:
 *   - dest 本体（category 'blocked'）… diffTargets で分類済み（block 記述子を持つ）
 *   - 保護ファイルの <dest>.new     … 分類には現れないため、ここで実地に検査する
 *
 * @param {string} cwd
 * @param {{src,dest,category,block?}[]} diffs
 * @returns {object[]} slot 付きの skip 記述子一覧
 */
function collectSkips(cwd, diffs) {
  const skips = [];
  for (const d of diffs) {
    if (d.category === 'blocked') {
      skips.push({ ...d.block, slot: 'dest' });
    } else if (d.category === 'protected') {
      const newBlock = inspectNew(cwd, `${d.dest}.new`);
      if (newBlock) skips.push({ ...newBlock, slot: 'new' });
    }
  }
  return skips;
}

/**
 * 安全に書き込めない書き込み先を差分サマリに明示する（R-1 / #84）。
 * 黙って落とす（silent cap）ことは禁止（RULES.md / Professional Honesty）。
 * シンボリックリンク・ハードリンク・通常ファイル以外（ディレクトリ / FIFO 等）を区別し、
 * リンク先パス／nlink／種別を表示する。--dry でも差分提示フェーズで呼ばれるため、
 * 書き込み前に何がスキップされるか分かる。
 */
function printSkips(skips) {
  if (skips.length === 0) return;
  console.log('');
  console.log('  ⚠️  安全に書き込めないためスキップします（.claude/ の外を書き換えず、外部 inode も壊さず、ディレクトリ／FIFO 等も触らないため）:');
  for (const s of skips) console.log(`     - ${formatSkip(s)}`);
  console.log('   シンボリックリンクは解除するかリンク先を直接編集し、ハードリンクや通常ファイル以外（ディレクトリ／FIFO 等）は通常ファイルに置き換えてください。');
}

/**
 * 対象ファイルに対応する `.new`（前回の upgrade で書き出され、まだ取り込まれていない
 * 可能性のあるもの）のうち、実在するものの相対パス一覧を返す。
 * cwd を走査するのではなく targets から導出するため、`.new` が upgrade 対象と誤認される
 * ことはない（enumerateUpgradeTargets はテンプレート由来で `.new` を含まない）。
 */
function findResidualNew(cwd, targets) {
  return targets
    .map((t) => `${t.dest}.new`)
    .filter((rel) => existsSync(join(cwd, rel)));
}

/**
 * 残置している `.new` を処理の冒頭で警告する（自動削除はしない）。
 *
 * `.new` は「ユーザーがまだ取り込んでいない未処理の作業」を表す。取り込みが完了したか
 * どうかはユーザーにしか判断できないため、こちらでは決して削除せず、存在を知らせるに
 * とどめる。--force 時は保護スキップが起きず `.new` を書き出さないため、これらは触られ
 * ないことを明示する。
 */
function printResidualNew(residual, { force }) {
  if (residual.length === 0) return;
  console.log('');
  console.log(`  ⚠️  前回の upgrade で書き出された .new が残っています（${residual.length} 件）:`);
  for (const rel of residual) console.log(`     - ${rel}`);
  if (force) {
    // --force では保護スキップが発生しない＝ .new を新たに書き出さないため、既存は不変
    console.log('   --force では保護スキップが発生しないため、これらの .new は上書きも削除もされません。');
    console.log('   差分を取り込み済みであれば手動で削除してください。');
  } else {
    // 冪等: 内容が最新テンプレートと同一の .new は再実行しても書き直さない（世代も増えない）
    console.log('   差分を取り込み済みであれば削除してください。内容が最新テンプレートと異なる .new は');
    console.log('   退避のうえ上書きされます（同一内容なら書き直さず、バックアップも作りません）。');
  }
}

/**
 * --diff 指定時に、上書き更新／保護スキップの対象について
 * 「あなたの現在の版 → 最新テンプレート」の unified diff を表示する。
 * 適用前（差分提示フェーズ）に呼ぶため、--dry --diff でも中身を確認できる。
 */
function printUnifiedDiffs({ cwd, diffs }) {
  const targets = diffs.filter((d) => d.category === 'update' || d.category === 'protected');
  if (targets.length === 0) return;
  console.log('');
  console.log('  🔎 差分（--diff）: あなたの現在の版（-） → 最新テンプレート（+）');
  for (const d of targets) {
    const current = readFileSync(join(cwd, d.dest), 'utf-8');
    const template = readFileSync(d.src, 'utf-8');
    const label = d.category === 'protected' ? '保護中' : '上書き更新';
    const diff = unifiedDiff(current, template, {
      oldLabel: `${d.dest}（現在）`,
      newLabel: `${d.dest}（最新テンプレート）`
    });
    console.log('');
    console.log(`  ── ${d.dest}（${label}） ──`);
    // diff 本文は各行が改行付き。末尾改行を保証して素通しで出力する。
    process.stdout.write(diff.endsWith('\n') ? diff : `${diff}\n`);
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

/**
 * 対話プロンプトで y/N を尋ねる。
 * stdin は注入可能（既定は process.stdin）。テストは既に閉じた（非TTYの）stdin を渡すことで、
 * 対話端末で実行してもプロンプト待ちでハングしないようにできる。
 */
function askYesNo(question, stdin = process.stdin) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: stdin, output: process.stdout });
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
 * stdin は注入可能（既定は process.stdin で本番挙動は不変）。判定・プロンプトの入力元を
 * 引数の stdin に統一することで、テストが対話端末の実行でも確定的に非対話経路を通せる
 * （TTY 環境で askYesNo がプロンプト待ちハングするのを防ぐ・#84）。
 *
 * @param {{ yes: boolean, stdin?: NodeJS.ReadStream }} opts
 * @returns {Promise<boolean>} true なら適用を続行してよい
 */
async function confirmProceed({ yes, stdin = process.stdin }) {
  if (yes) return true;
  if (!stdin.isTTY) {
    console.error('');
    console.error('⚠️  非対話環境のため確認を取得できません。安全のためアップグレードを中止します。');
    console.error('   意図的に続行する場合は --yes を付けて再実行してください。');
    return false;
  }
  return askYesNo('\nこの内容でアップグレードを適用しますか？ [y/N]: ', stdin);
}

/**
 * upgrade コマンドの本体。
 * process.exit は呼ばず、終了コードを number で返す（setup.js 側で exit する）。
 * これにより単体テストからも安全に呼び出せる。
 *
 * @param {string[]} args  'upgrade' を除いた引数配列
 * @param {{ cwd: string, pluginRoot?: string, stdin?: NodeJS.ReadStream }} ctx
 *        pluginRoot / stdin は既定でパッケージルート / process.stdin（本番挙動は不変）。
 *        テストが壊れた plugin.json や非TTYの stdin を注入して安全経路を検証するための注入点。
 * @returns {Promise<number>} 終了コード
 */
export async function runUpgrade(args, { cwd, pluginRoot = packageRoot, stdin = process.stdin }) {
  const isDry = args.includes('--dry');
  const force = args.includes('--force');
  const yes = args.includes('--yes');
  const showDiff = args.includes('--diff');
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
  if (showDiff) console.log('   モード: --diff（適用前に差分を表示します）');

  // 導入済みプラグインと registry のバージョン差を通知する（更新の気づきを与える）
  printUpdateNotice(checkPluginUpdates(cwd));

  // 1. 対象ファイルの列挙（グローバル + 選択チーム。plugin.json の install マップ由来）
  //    列挙段階は書き込みより前（fail-closed）。壊れた plugin.json（JSON.parse 失敗）などの
  //    例外を握らず素通しすると、setup.js まで未捕捉例外として上がりスタックトレースが露出する。
  //    ここで捕捉し、どのファイルが不正かを日本語で示して終了コード1で停止する（#84）。
  //    書き込み前なのでデータ損失は無い。
  let targets, excludedRepoConfig;
  try {
    ({ targets, excludedRepoConfig } = enumerateUpgradeTargets({ teams, pluginRoot }));
  } catch (e) {
    console.error('');
    console.error(`❌ アップグレード対象の列挙に失敗しました: ${e.message}`);
    console.error('   （書き込み前に停止したため、ファイルは一切変更していません）');
    return 1;
  }
  printExcludedRepoConfig(excludedRepoConfig);
  if (targets.length === 0) {
    console.log('');
    console.log('ℹ️  更新対象のテンプレートが見つかりませんでした。');
    return 0;
  }

  // 冒頭で、前回書き出した .new が残っていれば警告する（自動削除はしない）
  printResidualNew(findResidualNew(cwd, targets), { force });

  // 2. 差分の提示（読み取りのみ。まだ書き込みはしていない = fail-closed でデータ損失は無い）
  //    diffTargets / collectSkips は inspectDest / inspectNew 経由で lstatSync を呼ぶ。
  //    EACCES / ELOOP 等の非 ENOENT 例外は lstatOrNull が握らず再送出する（安全側）。
  //    #84 の try/catch は enumerateUpgradeTargets しか包んでいなかったため、これらの例外は
  //    setup.js まで生スタックトレースとして上がっていた。列挙段階と同じ整形メッセージで
  //    差分検査フェーズも fail-closed に停止させ、一貫させる（Issue #93 副次的な指摘）。
  let diffs, skips;
  try {
    diffs = diffTargets({ cwd, targets, force });
    // 書き込み先がリンク（経路のシンボリックリンク／ハードリンク／通常ファイル以外）のものは
    // 辿らずスキップする。差分サマリに明示する（R-1）。
    skips = collectSkips(cwd, diffs);
  } catch (e) {
    console.error('');
    console.error(`❌ 差分の検査に失敗しました: ${e.message}`);
    console.error('   （書き込み前に停止したため、ファイルは一切変更していません）');
    return 1;
  }
  printDiff(diffs);
  printSkips(skips);
  // --diff 指定時は、上書き更新／保護スキップ対象の中身の差分を表示する（--dry --diff でも表示）
  if (showDiff) printUnifiedDiffs({ cwd, diffs });

  // 3. --dry ならここで終了（書き込みもバックアップも行わない）
  if (isDry) {
    console.log('');
    console.log('🔍 --dry のため、ここで終了します（何も書き込んでいません）。');
    return 0;
  }

  // 適用する差分が無ければ、バックアップも確認も不要で終了。
  // 'protected' は「最新テンプレートを .new として書き出す」実作業を持つが、既に同一内容の
  // .new があるなら作業不要（冪等）。書き出しが必要な protected だけを writes に含める。
  // これにより、保護ファイルが残っていても .new が最新なら「すべて最新です」へ到達でき、
  // 再実行のたびにバックアップ世代が無駄に増える非冪等な挙動を防ぐ。
  const writes = diffs.filter((d) => {
    if (d.category === 'new' || d.category === 'update') return true;
    if (d.category === 'protected') {
      // <dest>.new がリンクなら書き出さない（辿らない）ため、書き込み作業に数えない（R-1）
      if (inspectNew(cwd, `${d.dest}.new`)) return false;
      return protectedNewNeedsWrite(cwd, d);
    }
    // 'same' / 'blocked' は書き込み無し
    return false;
  });
  if (writes.length === 0) {
    console.log('');
    console.log('✅ すべて最新です。適用する差分はありません。');
    // 「何もすることがない」のか「保護ファイルが未処理で残っている」のかを区別できるよう、
    // 保護ファイルとその .new の在り処を明示する（この時点で .new は最新＝取り込み待ち）。
    const protectedDiffs = diffs.filter((d) => d.category === 'protected');
    if (protectedDiffs.length > 0) {
      console.log('');
      console.log(`  ℹ️  ただし保護されたファイルが ${protectedDiffs.length} 件あります（本体は維持。最新テンプレートは .new に保存済み）:`);
      for (const d of protectedDiffs) {
        console.log(`     - ${d.dest} → 最新テンプレート: ${d.dest}.new`);
      }
      console.log('   差分を取り込み、済んだら .new を削除してください（取り込みが未了なら未処理として残ります）。');
    }
    return 0;
  }

  // 4. ユーザー確認
  const proceed = await confirmProceed({ yes, stdin });
  if (!proceed) {
    console.log('');
    console.log('🚫 アップグレードを中止しました。');
    return 0;
  }

  // 5. バックアップ（fail-closed）。差分の有無で絞らず、書き込む可能性のある全対象を退避する。
  //    これから「書き出す」.new のうち既に存在するものも退避対象に加える。既存の .new を
  //    上書きする前に必ず退避するため（fail-closed の維持）。既に最新の .new は書き出さない
  //    ので退避対象からも外す（冪等: 無駄なバックアップ世代を作らない）。createBackup は
  //    存在しないパスを除外するので、書き出し予定の .new 候補をそのまま渡してよい。
  // リンクの書き込み先は触らない（辿らない）ため、バックアップ対象からも除外する（R-1）。
  //  - dest 本体がリンク（category 'blocked'）は退避しない
  //  - 保護ファイルの <dest>.new がリンクのものも退避しない
  const backupDests = diffs
    .filter((d) => d.category !== 'blocked')
    .map((d) => d.dest);
  const protectedNewTargets = diffs
    .filter((d) => d.category === 'protected'
      && !inspectNew(cwd, `${d.dest}.new`)
      && protectedNewNeedsWrite(cwd, d))
    .map((d) => `${d.dest}.new`);
  printBackupIntro();
  let backup;
  try {
    backup = createBackup({
      cwd,
      targets: [...backupDests, ...protectedNewTargets],
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
  if (result.skipped.length > 0) {
    console.log(`   リンクのためスキップ: ${result.skipped.length} 件`);
  }
  if (result.skippedProtected.length > 0) {
    // 本体は維持しつつ、最新テンプレートを .new として隣に残したことを案内する。
    // .new は自動削除しない（取り込みの完了はユーザーにしか判断できないため）。
    // 今回書き出した .new と、既に最新だった .new を区別して表示する（冪等性の可視化）。
    console.log('');
    console.log('  🛡️  保護のためスキップ（あなたの編集を維持しました）:');
    for (const dest of result.skippedProtected) {
      const newRel = `${dest}.new`;
      console.log(`     - ${dest}`);
      // <dest>.new が「安全に書けない先」（経路のシンボリックリンク／ハードリンク／
      // 通常ファイル以外）だった場合は書き出しをスキップしている（R-1 / #84）。
      // 「保存しました」と誤って案内しないよう、スキップした旨を明示する。
      // 種別（symlink / hardlink / irregular）ごとに解除方法が異なるため案内文を変える。
      const newSkip = result.skipped.find((s) => s.slot === 'new' && s.rel === newRel);
      if (newSkip) {
        const kindLabel = newSkip.kind === 'hardlink' ? 'ハードリンク'
          : newSkip.kind === 'irregular' ? '通常ファイル以外'
            : 'シンボリックリンク';
        console.log(`       ⚠️  ${newRel} は${kindLabel}のため書き出しをスキップしました（${formatSkip(newSkip)}）`);
        if (newSkip.kind === 'hardlink') {
          console.log('       外部の実体（共有 inode）を破壊しないためです。通常ファイルに置き換えると次回から .new を書き出せます。');
        } else if (newSkip.kind === 'irregular') {
          console.log('       ディレクトリや FIFO 等は上書きしないためです。通常ファイルに置き換えると次回から .new を書き出せます。');
        } else {
          console.log('       .claude/ の外を書き換えないためです。リンクを解除すると次回から .new を書き出せます。');
        }
        continue;
      }
      if (result.writtenNew.includes(newRel)) {
        console.log(`       最新テンプレートを ${newRel} として保存しました`);
      } else {
        console.log(`       最新テンプレートは既に ${newRel} にあります（変更なし）`);
      }
      console.log(`       差分の確認: diff ${dest} ${newRel}`);
      console.log('       取り込んだら .new は削除してください');
    }
    console.log('');
    console.log('  ℹ️  カスタマイズ済みファイルを最新テンプレートで直接上書きするには --force を付けて再実行してください。');
  }
  // dest 本体がリンクだったものを完了報告に明示する（R-1）。silent cap の禁止。
  // .new のスキップは上の保護スキップ欄でファイルごとに示すため、ここでは本体のみ。
  // シンボリックリンクとハードリンクは扱いも案内文も異なるため、別の見出しで示す。
  const destSkips = result.skipped.filter((s) => s.slot === 'dest');
  const destSymlinks = destSkips.filter((s) => s.kind === 'symlink');
  const destHardlinks = destSkips.filter((s) => s.kind === 'hardlink');
  const destIrregular = destSkips.filter((s) => s.kind === 'irregular');
  if (destSymlinks.length > 0) {
    console.log('');
    console.log('  ⚠️  シンボリックリンクのためスキップしました（.claude/ の外を書き換えないため）:');
    for (const s of destSymlinks) console.log(`     - ${formatSkip(s)}`);
    console.log('   リンクを解除するか、リンク先を直接編集してください。');
  }
  if (destHardlinks.length > 0) {
    console.log('');
    console.log('  ⚠️  ハードリンクのためスキップしました（外部 inode の破壊を防ぐため）:');
    for (const s of destHardlinks) console.log(`     - ${formatSkip(s)}`);
    console.log('   通常ファイル（実体のコピー）に置き換えてから再実行してください。');
  }
  if (destIrregular.length > 0) {
    // ディレクトリ / FIFO / ソケット / デバイスは通常ファイルでないため上書きしない（#84）。
    // copyFileSync が EISDIR で落ちたり FIFO でハングするのを未然に防ぐ。silent cap の禁止。
    console.log('');
    console.log('  ⚠️  通常ファイルでないためスキップしました（ディレクトリ／FIFO／ソケット／デバイス等は上書きしません）:');
    for (const s of destIrregular) console.log(`     - ${formatSkip(s)}`);
    console.log('   通常ファイルに置き換えてから再実行してください。');
  }
  return 0;
}
