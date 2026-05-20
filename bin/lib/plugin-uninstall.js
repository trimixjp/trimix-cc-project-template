/**
 * uninstall コマンド実装
 */

import { existsSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import {
  loadInstalledPlugins, saveInstalledPlugins, findPlugin
} from './registry.js';

/** ai-team-config.yml の solo.target_labels からラベルを除去する */
function removeFromConfigTargetLabels(cwd, labelsToRemove) {
  const configPath = join(cwd, '.claude', 'ai-team-config.yml');
  if (!existsSync(configPath)) return null;

  let content = readFileSync(configPath, 'utf-8');
  const removed = [];
  for (const label of labelsToRemove) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const before = content;
    content = content.replace(new RegExp(`    - ${escaped}\\n`), '');
    if (content !== before) removed.push(label);
  }
  if (removed.length > 0) writeFileSync(configPath, content, 'utf-8');
  return removed;
}

/** プラグインをアンインストールする */
export async function uninstallPlugin(idOrTeamId, { cwd }) {
  if (!idOrTeamId) {
    console.error('❌ エラー: プラグイン ID を指定してください');
    console.error('使い方: npx ai-team uninstall <id>');
    process.exit(1);
  }

  const pluginsData = loadInstalledPlugins(cwd);

  // id または team_id で検索
  let pluginId = idOrTeamId;
  let pluginInfo = pluginsData.installed[idOrTeamId];
  if (!pluginInfo) {
    // team_id で検索
    const entry = Object.entries(pluginsData.installed).find(
      ([, v]) => v.team_id === idOrTeamId
    );
    if (entry) {
      [pluginId, pluginInfo] = entry;
    }
  }

  if (!pluginInfo) {
    console.error(`❌ "${idOrTeamId}" はインストールされていません`);
    console.log('インストール済み: npx ai-team list');
    process.exit(1);
  }

  console.log(`\n🗑️  ${pluginInfo.name} をアンインストールします...`);

  // ファイルを削除
  let removed = 0;
  for (const filePath of (pluginInfo.files ?? [])) {
    const fullPath = join(cwd, filePath);
    if (existsSync(fullPath)) {
      rmSync(fullPath, { force: true });
      removed++;
    }
  }

  // 空ディレクトリを削除（teams/<team_id>/ など）
  const teamDir = join(cwd, '.claude', 'teams', pluginInfo.team_id);
  if (existsSync(teamDir)) {
    try {
      rmSync(teamDir, { recursive: true, force: true });
    } catch {}
  }

  // ai-team-plugins.json を更新
  const soloTargetLabels = pluginInfo.solo_target_labels ?? [];
  delete pluginsData.installed[pluginId];
  saveInstalledPlugins(cwd, pluginsData);

  console.log(`  ✅ ${removed} ファイルを削除しました`);

  // ai-team-config.yml の target_labels からラベルを除去
  if (soloTargetLabels.length > 0) {
    const removedLabels = removeFromConfigTargetLabels(cwd, soloTargetLabels);
    if (removedLabels === null) {
      console.log('\n  ℹ️  ai-team-config.yml が見つからないため target_labels の更新をスキップしました');
    } else if (removedLabels.length > 0) {
      console.log('\n  ✅ ai-team-config.yml の target_labels を更新しました:');
      for (const label of removedLabels) {
        console.log(`     除去: ${label}`);
      }
    }
  }

  // GitHub ラベルの削除案内（自動削除はしない）
  if (pluginInfo.labels || true) {
    // plugin.json から labels を取得できないため、命名規則から推定
    console.log('\n  ℹ️  GitHub ラベルは自動削除されません（既存 Issue への影響を避けるため）');
    console.log(`  手動削除: gh label list | grep "^${pluginInfo.label_prefix}:" で一覧確認後、gh label delete で削除`);
  }

  console.log(`\n✅ ${pluginInfo.name} をアンインストールしました`);
  console.log('');
}
