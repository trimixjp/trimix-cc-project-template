/**
 * install コマンド実装
 */

import {
  existsSync, mkdirSync, copyFileSync, readdirSync,
  statSync, readFileSync, writeFileSync
} from 'fs';
import { execSync, execFileSync } from 'child_process';
import { resolve, join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';
import { mkdtempSync, rmSync } from 'fs';

import {
  loadRegistry, findPlugin, loadInstalledPlugins,
  saveInstalledPlugins, findInstalledByTeamId, findInstalledByLabelPrefix
} from './registry.js';
import { recordFiles } from './baseline.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, '../..');

/** カスタマイズ保護マーカー */
const CUSTOMIZED_MARKER = '# customized: true';

/**
 * カスタマイズ保護マーカーを検出する対象範囲（ファイル先頭からの行数）。
 *
 * マーカーはファイル先頭の「ヘッダ領域」に置く運用とし、検出もそこに限定する。
 * ファイル全体を検索すると、マーカーの付け方を本文で解説しているだけのファイル
 * （skills/ai-team-configure.md・skills/ai-team-install.md など）まで
 * 「カスタマイズ済み」と誤検出してしまい、ユーザーが未編集の配布物が upgrade で
 * 二度と更新されなくなるため（Issue #82）。
 *
 * 5 行にする根拠:
 *  - frontmatter を持たない YAML（workflow.yml）はマーカーを 1 行目に置く。
 *  - frontmatter を持つ Markdown（agents/*.md）は 1 行目が `---` のため、
 *    frontmatter を壊さないようマーカーを `---` の直後（= 2 行目）に YAML コメント
 *    として置く。
 *  この 2 種を確実に含めつつ、本文の解説（configure スキルでは 260 行目付近）は
 *  拾わないよう、少し余裕をもたせて先頭 5 行を対象とする。
 */
const CUSTOMIZED_MARKER_HEADER_LINES = 5;

/**
 * ファイルがカスタマイズ保護マーカー（# customized: true）を含むか判定する。
 * 単一ファイル分岐・ワイルドカード分岐の双方から共通利用する（DRY）。
 *
 * 検出はファイル先頭のヘッダ領域（先頭 CUSTOMIZED_MARKER_HEADER_LINES 行）に限定する。
 * 本文中にマーカー文字列を解説として含むだけのファイルを誤検出しないため。
 */
export function isCustomized(filePath) {
  if (!existsSync(filePath)) return false;
  // 第 2 引数で先頭 N 要素に切り詰める（N+1 行目以降は読み捨てる）
  const headerLines = readFileSync(filePath, 'utf-8').split('\n', CUSTOMIZED_MARKER_HEADER_LINES);
  return headerLines.some((line) => line.includes(CUSTOMIZED_MARKER));
}

/** ai-team-config.yml の solo.target_labels にラベルを追加する */
export function updateConfigTargetLabels(cwd, labelsToAdd) {
  const configPath = join(cwd, '.claude', 'ai-team-config.yml');
  if (!existsSync(configPath)) return null;

  let content = readFileSync(configPath, 'utf-8');
  if (!content.includes('  target_labels:')) return null;

  const added = [];
  for (const label of labelsToAdd) {
    if (content.includes(`    - ${label}`)) continue;
    content = content.replace(
      /(  target_labels:\n(?:    - .+\n)*)/,
      `$1    - ${label}\n`
    );
    added.push(label);
  }
  if (added.length > 0) writeFileSync(configPath, content, 'utf-8');
  return added;
}

/** GitHub ラベルを自動作成する */
function createLabels(labels) {
  let ghAvailable = true;
  try {
    execSync('gh --version', { stdio: 'pipe' });
  } catch {
    ghAvailable = false;
  }

  if (!ghAvailable) {
    console.log('');
    console.log('  ⚠️  gh コマンドが見つかりません。以下のコマンドで手動作成できます:');
    for (const label of labels) {
      console.log(`    gh label create "${label.name}" --color "${label.color}" --description "${label.description || ''}"`);
    }
    return;
  }

  console.log('');
  console.log('  GitHub ラベルを作成中...');
  for (const label of labels) {
    try {
      // シェル文字列補間によるクォート崩れを避けるため配列引数で実行する
      execFileSync(
        'gh',
        ['label', 'create', label.name, '--color', label.color, '--description', label.description || '', '--force'],
        { stdio: 'pipe' }
      );
      console.log(`  ✅ ラベル作成: ${label.name}`);
    } catch (e) {
      const msg = e.stderr?.toString() ?? '';
      console.log(`  ⚠️  ラベル作成スキップ: ${label.name} (${msg.trim() || '認証エラーの可能性'})`);
    }
  }
}

/** プラグインをインストールする */
export async function installPlugin(idOrTeamId, { cwd, force = false }) {
  // 1. registry からプラグインを探す
  const pluginEntry = findPlugin(idOrTeamId);
  if (!pluginEntry) {
    console.error(`❌ エラー: プラグイン "${idOrTeamId}" が見つかりません`);
    console.error('利用可能なプラグイン: npx ai-team gallery');
    process.exit(1);
  }

  // registry で distribution: "template" のチームはプラグインパッケージ非配布
  // （templates/teams/<id> 同梱で配布し、registry と solo.target_labels で管理する方針）
  if (pluginEntry.distribution === 'template') {
    console.error(`\nℹ️  "${pluginEntry.name}" (${pluginEntry.team_id}) はプラグインパッケージとしては提供されていません`);
    console.error('   このチームはテンプレート同梱で配布されています。');
    console.error('   Claude Code で /ai-team-setup を実行し、チーム選択で追加してください');
    process.exit(1);
  }

  console.log(`\n🔍 プラグイン "${pluginEntry.name}" (${pluginEntry.id}) をインストールします...`);

  // 2. team_id 衝突チェック
  const existingByTeamId = findInstalledByTeamId(cwd, pluginEntry.team_id);
  if (existingByTeamId) {
    const [existingId, existingInfo] = existingByTeamId;
    if (existingId === pluginEntry.id) {
      console.log(`\n⚠️  ${pluginEntry.name} は既にインストール済みです（v${existingInfo.version}）`);
      console.log(`   更新するには: npx ai-team install ${idOrTeamId} --replace`);
      process.exit(0);
    } else {
      console.error(`\n❌ エラー: team_id "${pluginEntry.team_id}" は既に "${existingInfo.package}" でインストール済みです`);
      console.error(`   別の team_id を使うか、既存プラグインをアンインストールしてください:`);
      console.error(`   npx ai-team uninstall ${existingId}`);
      process.exit(1);
    }
  }

  // 3. label_prefix 衝突チェック（警告のみ）
  const existingByLabel = findInstalledByLabelPrefix(cwd, pluginEntry.label_prefix);
  if (existingByLabel) {
    const [existingId] = existingByLabel;
    console.log(`\n⚠️  警告: ラベルプレフィックス "${pluginEntry.label_prefix}" は既存プラグイン "${existingId}" でも使用されています`);
    console.log('   同一 Issue が複数ワークフローで処理される可能性がありますが、ai-team:in-progress ロックで二重実行を防止します');
  }

  // 4. パッケージを取得（packages/ ディレクトリからローカル参照）
  // MVP: packages/ ディレクトリに直接配置されているパッケージを参照
  const localPackagePath = join(packageRoot, 'packages', `workflow-${pluginEntry.team_id}`);
  let pluginDir;

  if (existsSync(localPackagePath)) {
    // ローカルパッケージから直接
    pluginDir = localPackagePath;
    console.log(`\n  📦 ローカルパッケージを使用: ${localPackagePath}`);
  } else {
    // npm からパッケージを取得（将来の npm publish 後）
    console.log(`\n  📦 npm からパッケージを取得: ${pluginEntry.package}`);
    const tmpDir = mkdtempSync(join(tmpdir(), 'ai-team-'));
    try {
      execSync(`npm pack ${pluginEntry.package} --pack-destination ${tmpDir}`, { stdio: 'pipe', cwd });
      const tgzFile = readdirSync(tmpDir).find(f => f.endsWith('.tgz'));
      if (!tgzFile) throw new Error('tgz ファイルが見つかりません');
      execSync(`tar -xzf ${join(tmpDir, tgzFile)} -C ${tmpDir}`, { stdio: 'pipe' });
      pluginDir = join(tmpDir, 'package');
    } catch (e) {
      console.error(`❌ パッケージの取得に失敗しました: ${e.message}`);
      rmSync(tmpDir, { recursive: true, force: true });
      process.exit(1);
    }
  }

  // 5. plugin.json を読み込む
  const pluginJsonPath = join(pluginDir, 'plugin.json');
  if (!existsSync(pluginJsonPath)) {
    console.error(`❌ plugin.json が見つかりません: ${pluginJsonPath}`);
    process.exit(1);
  }
  const plugin = JSON.parse(readFileSync(pluginJsonPath, 'utf-8'));

  // 6. label_prefix バリデーション
  for (const label of (plugin.labels ?? [])) {
    if (!label.name.startsWith(`${plugin.label_prefix}:`)) {
      console.error(`❌ エラー: ラベル "${label.name}" は "${plugin.label_prefix}:" で始まる必要があります`);
      process.exit(1);
    }
  }

  // 7. ファイルをコピー展開
  console.log('\n  ファイルを展開中...');
  const installedFiles = [];
  // baseline に記録するのは「実際に配置した（copyFileSync した）」ファイルのみ。
  // カスタマイズ済みでスキップしたユーザー編集物は記録しない（#85・経路3）。
  const placedFiles = [];
  let skippedCustomized = 0;
  for (const [srcPattern, destDir] of Object.entries(plugin.install ?? {})) {
    const parts = srcPattern.split('*');
    if (parts.length === 1) {
      // 単一ファイル
      const srcFile = join(pluginDir, srcPattern);
      if (!existsSync(srcFile)) {
        console.log(`  ⚠️  スキップ: ${srcPattern} が見つかりません`);
        continue;
      }
      const destRelPath = destDir.endsWith('/') ? join(destDir, basename(srcFile)) : destDir;
      const destPath = join(cwd, destRelPath);
      mkdirSync(dirname(destPath), { recursive: true });
      // カスタマイズ済みファイルの上書き保護
      if (!force && isCustomized(destPath)) {
        console.log(`  ⏭️  スキップ: ${destRelPath}（カスタマイズ済み。上書きする場合は --force を使用）`);
        installedFiles.push(destRelPath);
        skippedCustomized++;
        continue;
      }
      copyFileSync(srcFile, destPath);
      installedFiles.push(destRelPath);
      placedFiles.push(destRelPath);
      console.log(`  ✅ ${destRelPath}`);
    } else {
      // ワイルドカード: パターンの * 前部分をディレクトリとして扱う
      const srcDirPath = join(pluginDir, parts[0].replace(/\/$/, ''));
      if (!existsSync(srcDirPath)) {
        console.log(`  ⚠️  スキップ: ${parts[0]} が見つかりません`);
        continue;
      }
      const destFull = join(cwd, destDir);
      mkdirSync(destFull, { recursive: true });
      const { files: tracked, skipped, copied } = copyDirAndTrack(srcDirPath, destFull, destDir, force);
      installedFiles.push(...tracked);
      placedFiles.push(...copied);
      skippedCustomized += skipped;
      console.log(`  ✅ ${destDir} (${tracked.length} ファイル)`);
    }
  }

  // 配置したファイル（.claude/ 配下のみ）を baseline へ記録する（#85・経路3）。
  // .claude/ の外のリポジトリ設定（.github 等）は upgrade の対象外なので記録しない。
  const claudePlaced = placedFiles.filter((rel) => rel.split(/[\\/]+/)[0] === '.claude');
  if (claudePlaced.length > 0) {
    try {
      recordFiles(cwd, claudePlaced);
    } catch { /* baseline 記録の失敗はインストールの成否に影響させない */ }
  }

  // 8. GitHub ラベルの自動作成
  if (plugin.labels && plugin.labels.length > 0) {
    createLabels(plugin.labels);
  }

  // 9. ai-team-plugins.json を更新
  const pluginsData = loadInstalledPlugins(cwd);
  pluginsData.installed[plugin.id] = {
    id: plugin.id,
    team_id: plugin.team_id,
    label_prefix: plugin.label_prefix,
    name: plugin.name,
    package: plugin.package,
    version: plugin.version,
    installed_at: new Date().toISOString(),
    files: installedFiles,
    solo_target_labels: plugin.solo_target_labels ?? []
  };
  saveInstalledPlugins(cwd, pluginsData);

  // 10. ai-team-config.yml の solo.target_labels を更新
  const addedLabels = updateConfigTargetLabels(cwd, plugin.solo_target_labels ?? []);
  if (addedLabels === null) {
    console.log('\n  ℹ️  ai-team-config.yml が見つからないため target_labels の更新をスキップしました');
    console.log('     （multi-user モードの場合は正常です）');
  } else if (addedLabels.length > 0) {
    console.log('\n  ✅ ai-team-config.yml の target_labels を更新しました:');
    for (const label of addedLabels) {
      console.log(`     追加: ${label}`);
    }
  } else {
    console.log('\n  ✅ ai-team-config.yml の target_labels は既に最新です');
  }

  console.log(`\n✅ ${plugin.name} をインストールしました！`);
  if (skippedCustomized > 0) {
    console.log(`\n  ℹ️  ${skippedCustomized} 件のカスタマイズ済みファイルをスキップしました`);
    console.log('     強制上書きする場合: npx @trimix/ai-team install <team_id> --force');
    console.log('     ※ 既存の /ai-team-configure で生成したファイルに # customized: true がない場合は手動追記が必要です');
  }
  console.log('\n次のステップ:');
  console.log('  Claude Code を起動し、/ai-team-setup を実行してください');
  console.log('');
}

/**
 * ディレクトリを再帰コピーし、コピーしたファイルパス一覧とスキップ件数を返す。
 * force === false かつ退避先がカスタマイズ済み（# customized: true）の場合はコピーをスキップし、
 * 単一ファイル分岐と同一形式のスキップログを出力する。
 *
 * `copied` は「実際に copyFileSync で書き込んだ」相対パスのみ（スキップした
 * カスタマイズ済みファイルは含まない）。baseline へ記録するのは自分が配置した内容だけであり、
 * ユーザーの編集物（スキップ対象）を基準に取り込まないため（#85）。
 * @returns {{ files: string[], skipped: number, copied: string[] }}
 */
export function copyDirAndTrack(src, dest, destPrefix, force = false) {
  const files = [];
  const copied = [];
  let skipped = 0;
  for (const entry of readdirSync(src)) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    const relPath = join(destPrefix, entry);
    if (statSync(srcPath).isDirectory()) {
      mkdirSync(destPath, { recursive: true });
      const sub = copyDirAndTrack(srcPath, destPath, relPath, force);
      files.push(...sub.files);
      copied.push(...sub.copied);
      skipped += sub.skipped;
    } else {
      // カスタマイズ済みファイルの上書き保護（単一ファイル分岐と同じ判定を共通利用）
      if (!force && isCustomized(destPath)) {
        console.log(`  ⏭️  スキップ: ${relPath}（カスタマイズ済み。上書きする場合は --force を使用）`);
        files.push(relPath);
        skipped++;
        continue;
      }
      copyFileSync(srcPath, destPath);
      files.push(relPath);
      copied.push(relPath);
    }
  }
  return { files, skipped, copied };
}
