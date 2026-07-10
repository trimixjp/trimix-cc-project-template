#!/usr/bin/env node
/**
 * npm install 後に自動実行されるpostinstallスクリプト。
 * Skillファイルをプロジェクトの .claude/commands/ にコピーします。
 */

import { mkdirSync, copyFileSync, existsSync, readdirSync, statSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { SKILL_FILES } from './lib/skill-files.js';
import { checkPluginUpdates, printUpdateNotice } from './lib/version-check.js';
import { recordFiles } from './lib/baseline.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, '..');

// npm install が実行されたプロジェクトのルートを取得
// INIT_CWD: npm install を実行したディレクトリ（node_modules の親）
const projectRoot = process.env.INIT_CWD || process.cwd();

// 自分自身のパッケージ開発中は postinstall をスキップ
if (projectRoot === packageRoot) {
  process.exit(0);
}

const skillsSource = join(packageRoot, 'skills');
const skillsDest = join(projectRoot, '.claude', 'commands');

// ディレクトリを再帰的にコピーするヘルパー
function copyDirRecursive(src, dest) {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    if (statSync(srcPath).isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

try {
  // Skillファイルを .claude/commands/ に展開
  mkdirSync(skillsDest, { recursive: true });

  let count = 0;
  const placedRels = [];
  for (const file of SKILL_FILES) {
    const src = join(skillsSource, file);
    if (!existsSync(src)) continue;
    copyFileSync(src, join(skillsDest, file));
    placedRels.push(join('.claude', 'commands', file));
    count++;
  }

  // 配置したスキルを baseline（upgrade の保護判定基準）へ記録する（#85・経路1）。
  // 付随的機能のため、失敗しても postinstall 全体は成功扱いとする。
  try {
    recordFiles(projectRoot, placedRels);
  } catch { /* baseline 記録の失敗は展開の成否に影響させない */ }

  console.log(`\n✅ @trimix/ai-team: ${count} 件のSkillファイルを .claude/commands/ に展開しました`);
  console.log('   Claude Code で /ai-team-setup を実行してセットアップを完了してください\n');
} catch (err) {
  console.warn('\n⚠️  @trimix/ai-team: Skillファイルの展開に失敗しました');
  console.warn('   手動で npx ai-team install を実行してください\n');
}

try {
  // 配布物には最新バージョン1つ分のみを同梱している（ai-team-manual-dist/）。
  // これを導入先プロジェクトの ai-team-manual/ に展開する。
  const docsSrc = join(packageRoot, 'ai-team-manual-dist');
  const docsDest = join(projectRoot, 'ai-team-manual');
  if (existsSync(docsSrc)) {
    copyDirRecursive(docsSrc, docsDest);
    console.log('✅ @trimix/ai-team: ドキュメント（最新版）を ai-team-manual/ に展開しました');
    console.log('   ブラウザで ai-team-manual/index.html を開くと閲覧できます\n');
  }
} catch (err) {
  console.warn('\n⚠️  @trimix/ai-team: ドキュメントの展開に失敗しました\n');
}

try {
  // 導入済みプラグインの版番号（ai-team-plugins.json）と registry.json の最新版を比較し、
  // 差があれば「更新があります」と通知する。通知のみで書き込みは行わない。
  printUpdateNotice(checkPluginUpdates(projectRoot));
} catch (err) {
  // 通知は付随的機能。失敗しても postinstall 全体は成功扱いとする。
}
