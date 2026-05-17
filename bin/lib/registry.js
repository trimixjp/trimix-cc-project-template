/**
 * registry.json と ai-team-plugins.json の読み書きユーティリティ
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, '../..');

const PLUGINS_FILENAME = 'ai-team-plugins.json';

/** registry.json を読み込む */
export function loadRegistry() {
  const registryPath = join(packageRoot, 'registry.json');
  return JSON.parse(readFileSync(registryPath, 'utf-8'));
}

/** id でプラグインエントリを検索（registry.json から） */
export function findPlugin(id) {
  const registry = loadRegistry();
  return registry.plugins.find(p => p.id === id || p.team_id === id) ?? null;
}

/** ai-team-plugins.json を読み込む（なければ空を返す） */
export function loadInstalledPlugins(cwd) {
  const filePath = join(cwd, PLUGINS_FILENAME);
  if (!existsSync(filePath)) return { installed: {} };
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

/** ai-team-plugins.json を保存する */
export function saveInstalledPlugins(cwd, data) {
  const filePath = join(cwd, PLUGINS_FILENAME);
  writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

/** team_id でインストール済みプラグインを探す */
export function findInstalledByTeamId(cwd, teamId) {
  const { installed } = loadInstalledPlugins(cwd);
  return Object.entries(installed).find(([, v]) => v.team_id === teamId) ?? null;
}

/** label_prefix で衝突するインストール済みプラグインを探す */
export function findInstalledByLabelPrefix(cwd, labelPrefix) {
  const { installed } = loadInstalledPlugins(cwd);
  return Object.entries(installed).find(([, v]) => v.label_prefix === labelPrefix) ?? null;
}
