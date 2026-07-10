#!/usr/bin/env node
/**
 * @trimix/ai-team CLI
 * Skillファイルを .claude/commands/ に展開します。
 * 実際のセットアップは Claude Code Skill コマンド /ai-team-setup で行います。
 */

import { readFileSync, mkdirSync, copyFileSync, existsSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { SKILL_FILES } from './lib/skill-files.js';

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
  console.log('  npx @trimix/ai-team upgrade [team_id]    導入済みチームを最新テンプレートへ更新（バックアップ付き）');
  console.log('  npx @trimix/ai-team gallery              利用可能なプラグイン一覧を表示');
  console.log('  npx @trimix/ai-team list                 インストール済みプラグインを表示');
  console.log('  npx @trimix/ai-team uninstall <team_id>  プラグインをアンインストール');
  console.log('  npx @trimix/ai-team ticket <cmd>         チケット操作（github / local）');
  console.log('  npx @trimix/ai-team --version            バージョンを表示');
  console.log('  npx @trimix/ai-team --help               このヘルプを表示');
  console.log('');
  console.log('ticket サブコマンド例:');
  console.log('  npx @trimix/ai-team ticket list');
  console.log('  npx @trimix/ai-team ticket view 1');
  console.log('  npx @trimix/ai-team ticket create --title "題名" --body "本文"');
  console.log('');
  console.log('upgrade オプション:');
  console.log('  --dry     差分の提示のみ（書き込み・バックアップは行いません）');
  console.log('  --force   カスタマイズ済みファイルも上書きする');
  console.log('  --yes     確認プロンプトを省略（非対話環境で明示的に続行する場合）');
  console.log('');
  console.log('展開後のセットアップ:');
  console.log('  Claude Code を起動し、/ai-team-setup を実行してください');
  console.log('');
  console.log('利用可能なチームID: backend / frontend / content / infra');
}

function installSkills() {
  const skillsSource = join(packageRoot, 'skills');
  const skillsDest = join(cwd, '.claude', 'commands');

  // .claude/commands/ を作成
  mkdirSync(skillsDest, { recursive: true });

  let installed = 0;
  for (const file of SKILL_FILES) {
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
  console.log('  2. /ai-team-setup を実行してAIチームをセットアップしてください');
}

// メイン処理（非同期コマンドに対応）
async function main() {
  if (command === 'install' && args[1]) {
    // プラグインインストール
    const { installPlugin } = await import('./lib/plugin-install.js');
    const force = args.includes('--force');
    await installPlugin(args[1], { cwd, force });
  } else if (command === 'install') {
    // 引数なし: 従来通りスキルファイル展開
    installSkills();
  } else if (command === 'upgrade') {
    // 導入済みチーム定義・共通設定・skills を最新テンプレートへ更新
    const { runUpgrade } = await import('./lib/upgrade.js');
    const code = await runUpgrade(args.slice(1), { cwd });
    process.exit(code);
  } else if (command === 'gallery') {
    const { showGallery } = await import('./lib/gallery.js');
    await showGallery({ cwd, packageRoot });
  } else if (command === 'list') {
    const { listPlugins } = await import('./lib/gallery.js');
    await listPlugins({ cwd });
  } else if (command === 'uninstall') {
    const { uninstallPlugin } = await import('./lib/plugin-uninstall.js');
    await uninstallPlugin(args[1], { cwd });
  } else if (command === 'ticket') {
    // ticket 以降の引数を ticket-cli に委譲
    process.argv = [process.argv[0], process.argv[1], ...args.slice(1)];
    const { runTicketCli } = await import('./ticket-cli.js');
    await runTicketCli();
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
