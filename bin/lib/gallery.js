/**
 * gallery / list コマンド実装
 */

import { loadRegistry, loadInstalledPlugins } from './registry.js';

/** ギャラリー一覧を表示する */
export async function showGallery({ cwd }) {
  const registry = loadRegistry();
  const { installed } = loadInstalledPlugins(cwd);
  const installedIds = new Set(Object.keys(installed));

  const installedPlugins = registry.plugins.filter(p => installedIds.has(p.id));
  const availablePlugins = registry.plugins.filter(p => !installedIds.has(p.id));

  console.log('');
  console.log('@trimix/ai-team ワークフロー・ギャラリー');
  console.log('─'.repeat(50));

  if (installedPlugins.length > 0) {
    console.log('[インストール済み]');
    for (const p of installedPlugins) {
      const info = installed[p.id];
      console.log(`  ✅ ${p.team_id.padEnd(12)} ${p.name.padEnd(20)} v${info.version}  ${p.description}`);
    }
  }

  if (availablePlugins.length > 0) {
    if (installedPlugins.length > 0) console.log('');
    console.log('[利用可能]');
    for (const p of availablePlugins) {
      console.log(`  📦 ${p.team_id.padEnd(12)} ${p.name.padEnd(20)} v${p.version}  ${p.description}`);
    }
  }

  if (registry.plugins.length === 0) {
    console.log('  利用可能なプラグインがありません');
  }

  console.log('');
  console.log('インストール: npx ai-team install <team_id>');
  console.log('詳細表示:     npx ai-team gallery --show <team_id>');
  console.log('');
}

/** インストール済みプラグイン一覧を表示する */
export async function listPlugins({ cwd }) {
  const { installed } = loadInstalledPlugins(cwd);
  const ids = Object.keys(installed);

  if (ids.length === 0) {
    console.log('インストール済みのプラグインはありません');
    console.log('インストール: npx ai-team install <team_id>');
    return;
  }

  console.log('');
  console.log('インストール済みプラグイン:');
  for (const [id, info] of Object.entries(installed)) {
    console.log(`  ✅ ${info.team_id.padEnd(12)} ${info.name.padEnd(20)} v${info.version}  (${info.package})`);
  }
  console.log('');
}
