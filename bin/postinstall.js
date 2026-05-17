#!/usr/bin/env node
/**
 * npm install 後に自動実行されるpostinstallスクリプト。
 * Skillファイルをプロジェクトの .claude/commands/ にコピーします。
 */

import { mkdirSync, copyFileSync, existsSync } from 'fs';
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
  'ai-team-gallery.md',   // 追加
  'ai-team-install.md',   // 追加
];

try {
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
  // postinstall の失敗でインストール全体を止めない
  console.warn('\n⚠️  @trimix/ai-team: Skillファイルの展開に失敗しました');
  console.warn('   手動で npx ai-team install を実行してください\n');
}
