/**
 * プラグインのバージョン追跡ユーティリティ
 *
 * ai-team-plugins.json に記録された「導入時のバージョン」と、registry.json に
 * 記載された「最新バージョン」を突き合わせ、差があるプラグインを検出する。
 * upgrade 実行時と postinstall 完了時に「更新があります」と通知するために使う。
 *
 * registry.json は正源（配布物に同梱される最新の版番号）であり、
 * ai-team-plugins.json は導入先プロジェクトに残る導入履歴である。
 */

import { loadRegistry, loadInstalledPlugins } from './registry.js';

/**
 * 導入済みプラグインと registry の版番号を比較し、差のあるものを返す。
 *
 * @param {string} cwd 対象プロジェクトのルート（ai-team-plugins.json を探す場所）
 * @returns {{ id: string, name: string, installed: string, latest: string }[]}
 *   installed（導入時の版）と latest（registry の版）が異なるプラグインの一覧。
 */
export function checkPluginUpdates(cwd) {
  const registry = loadRegistry();
  const { installed } = loadInstalledPlugins(cwd);
  const updates = [];

  for (const [id, info] of Object.entries(installed)) {
    const entry = registry.plugins.find((p) => p.id === id);
    // registry に無い（配布終了等）・版番号が欠落しているものは比較対象外
    if (!entry || !entry.version || !info.version) continue;
    if (entry.version !== info.version) {
      updates.push({
        id,
        name: info.name ?? entry.name ?? id,
        installed: info.version,
        latest: entry.version
      });
    }
  }

  return updates;
}

/**
 * 更新通知を表示する。差が無ければ何も出力しない。
 *
 * @param {{ id: string, name: string, installed: string, latest: string }[]} updates
 * @param {(msg?: string) => void} [log] 出力関数（テスト差し替え用。既定 console.log）
 */
export function printUpdateNotice(updates, log = console.log) {
  if (!updates || updates.length === 0) return;

  log('');
  log('🔔 更新があります: 導入済みプラグインより新しいバージョンが registry にあります');
  for (const u of updates) {
    log(`   - ${u.name}: v${u.installed} → v${u.latest}`);
  }
  log('   最新テンプレートへ更新するには: npx @trimix/ai-team upgrade [team_id]');
}
