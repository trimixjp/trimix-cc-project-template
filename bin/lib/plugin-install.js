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

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, '../..');

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
      if (!force && existsSync(destPath)) {
        const existing = readFileSync(destPath, 'utf-8');
        if (existing.includes('# customized: true')) {
          console.log(`  ⏭️  スキップ: ${destRelPath}（カスタマイズ済み。上書きする場合は --force を使用）`);
          installedFiles.push(destRelPath);
          skippedCustomized++;
          continue;
        }
      }
      copyFileSync(srcFile, destPath);
      installedFiles.push(destRelPath);
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
      const copied = copyDirAndTrack(srcDirPath, destFull, destDir);
      installedFiles.push(...copied);
      console.log(`  ✅ ${destDir} (${copied.length} ファイル)`);
    }
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

/** ディレクトリをコピーしてファイルパス一覧を返す */
function copyDirAndTrack(src, dest, destPrefix) {
  const result = [];
  for (const entry of readdirSync(src)) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    const relPath = join(destPrefix, entry);
    if (statSync(srcPath).isDirectory()) {
      mkdirSync(destPath, { recursive: true });
      result.push(...copyDirAndTrack(srcPath, destPath, relPath));
    } else {
      copyFileSync(srcPath, destPath);
      result.push(relPath);
    }
  }
  return result;
}
