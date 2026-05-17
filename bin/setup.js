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
  console.log('  npx @trimix/ai-team install              Skillファイルを .claude/commands/ に展開');
  console.log('  npx @trimix/ai-team install <team_id>    ワークフロープラグインをインストール');
  console.log('  npx @trimix/ai-team gallery              利用可能なプラグイン一覧を表示');
  console.log('  npx @trimix/ai-team list                 インストール済みプラグインを表示');
  console.log('  npx @trimix/ai-team uninstall <team_id>  プラグインをアンインストール');
  console.log('  npx @trimix/ai-team configure <team_id>  ワークフローを対話式に設定');
  console.log('  npx @trimix/ai-team --version            バージョンを表示');
  console.log('  npx @trimix/ai-team --help               このヘルプを表示');
  console.log('');
  console.log('展開後のセットアップ:');
  console.log('  Claude Code を起動し、/ai-team setup を実行してください');
  console.log('');
  console.log('利用可能なチームID: backend / frontend / content / infra');
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
    'ai-team-resume.md',
    'ai-team-gallery.md',
    'ai-team-install.md',
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

// メイン処理（非同期コマンドに対応）
async function main() {
  if (command === 'install' && args[1]) {
    // プラグインインストール
    const { installPlugin } = await import('./lib/plugin-install.js');
    await installPlugin(args[1], { cwd });
  } else if (command === 'install') {
    // 引数なし: 従来通りスキルファイル展開
    installSkills();
  } else if (command === 'gallery') {
    const { showGallery } = await import('./lib/gallery.js');
    await showGallery({ cwd, packageRoot });
  } else if (command === 'list') {
    const { listPlugins } = await import('./lib/gallery.js');
    await listPlugins({ cwd });
  } else if (command === 'configure') {
    const { configureWorkflow } = await import('./lib/workflow-config.js');
    await configureWorkflow(args[1], { cwd });
  } else if (command === 'uninstall') {
    const { uninstallPlugin } = await import('./lib/plugin-uninstall.js');
    await uninstallPlugin(args[1], { cwd });
  } else if (command === '--version' || command === '-v') {
    printVersion();
  } else if (command === '--help' || command === '-h' || !command) {
    printHelp();
  } else {
    console.error(`不明なコマンド: ${command}`);
    console.error('使い方: npx @trimix/ai-team --help');
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
