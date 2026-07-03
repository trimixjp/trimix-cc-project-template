#!/usr/bin/env node
/**
 * npm install 後に自動実行されるpostinstallスクリプト。
 * Skillファイルをプロジェクトの .claude/commands/ にコピーします。
 */

import { mkdirSync, copyFileSync, existsSync, readdirSync, statSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

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

const skillFiles = [
  'ai-team-setup.md',
  'ai-team-run.md',
  'ai-team-watch.md',
  'ai-team-resume.md',
  'ai-team-gallery.md',
  'ai-team-install.md',
  'ai-team-configure.md',
];

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
  for (const file of skillFiles) {
    const src = join(skillsSource, file);
    if (!existsSync(src)) continue;
    copyFileSync(src, join(skillsDest, file));
    count++;
  }

  console.log(`\n✅ @trimix/ai-team: ${count} 件のSkillファイルを .claude/commands/ に展開しました`);
  console.log('   Claude Code で /ai-team setup を実行してセットアップを完了してください\n');
} catch (err) {
  console.warn('\n⚠️  @trimix/ai-team: Skillファイルの展開に失敗しました');
  console.warn('   手動で npx ai-team install を実行してください\n');
}

try {
  // コンパイル済みドキュメントを ai-team-manual/docs/ に展開
  const docsSrc = join(packageRoot, 'ai-team-manual');
  const docsDest = join(projectRoot, 'ai-team-manual');
  if (existsSync(docsSrc)) {
    copyDirRecursive(docsSrc, docsDest);
    console.log('✅ @trimix/ai-team: ドキュメントを ai-team-manual/docs/ に展開しました');
    console.log('   ブラウザで ai-team-manual/docs/index.html を開くと閲覧できます\n');
  }
} catch (err) {
  console.warn('\n⚠️  @trimix/ai-team: ドキュメントの展開に失敗しました\n');
}
