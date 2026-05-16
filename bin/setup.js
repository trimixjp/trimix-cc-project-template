#!/usr/bin/env node
/**
 * @trimix/ai-team CLI
 * Skillファイルを .claude/commands/ に展開します。
 * 実際のセットアップは Claude Code Skill コマンド /ai-team setup で行います。
 */

import { readFileSync, mkdirSync, copyFileSync, existsSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, '..');
const cwd = process.cwd();

const args = process.argv.slice(2);
const command = args[0];

function printVersion() {
  const pkg = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf-8'));
  console.log(`@trimix/ai-team v${pkg.version}`);
}

function printHelp() {
  printVersion();
  console.log('');
  console.log('使い方:');
  console.log('  npx @trimix/ai-team install   Skillファイルを .claude/commands/ に展開');
  console.log('  npx @trimix/ai-team --version  バージョンを表示');
  console.log('  npx @trimix/ai-team --help     このヘルプを表示');
  console.log('');
  console.log('展開後のセットアップ:');
  console.log('  Claude Code を起動し、/ai-team setup を実行してください');
}

function installSkills() {
  const skillsSource = join(packageRoot, 'skills');
  const skillsDest = join(cwd, '.claude', 'commands');

  // .claude/commands/ を作成
  mkdirSync(skillsDest, { recursive: true });

  const skillFiles = [
    'ai-team-setup.md',
    'ai-team-run.md',
    'ai-team-watch.md',
  ];

  let installed = 0;
  for (const file of skillFiles) {
    const src = join(skillsSource, file);
    const dest = join(skillsDest, file);

    if (!existsSync(src)) {
      console.error(`  ⚠️  スキップ: ${file} が見つかりません`);
      continue;
    }

    const alreadyExists = existsSync(dest);
    copyFileSync(src, dest);
    console.log(`  ${alreadyExists ? '🔄 更新' : '✅ 追加'}: .claude/commands/${file}`);
    installed++;
  }

  console.log('');
  console.log(`✅ ${installed} 件のSkillファイルを展開しました`);
  console.log('');
  console.log('次のステップ:');
  console.log('  1. Claude Code を起動してください');
  console.log('  2. /ai-team setup を実行してAIチームをセットアップしてください');
}

// メイン処理
if (command === 'install') {
  installSkills();
} else if (command === '--version' || command === '-v') {
  printVersion();
} else if (command === '--help' || command === '-h' || !command) {
  printHelp();
} else {
  console.error(`不明なコマンド: ${command}`);
  console.error('使い方: npx @trimix/ai-team --help');
  process.exit(1);
}
