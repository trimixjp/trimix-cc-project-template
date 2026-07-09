#!/usr/bin/env node
/**
 * templates/ → .claude/ の同期スクリプト
 *
 * templates/ が SSOT（正源）であり、.claude/ は gitignore 対象の生成物。
 * このスクリプトは templates/ の変更を開発中の .claude/ に適用する。
 *
 * 使い方:
 *   npm run sync           # 全テンプレートを同期
 *   npm run sync -- --dry  # 変更内容の確認のみ（実際にはコピーしない）
 */

import { readFileSync, mkdirSync, copyFileSync, readdirSync, statSync, existsSync } from 'fs';
import { resolve, dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');
const templatesDir = join(projectRoot, 'templates');
const claudeDir = join(projectRoot, '.claude');

const isDry = process.argv.includes('--dry');

if (isDry) {
  console.log('🔍 ドライラン: 実際にはコピーしません\n');
}

// templates/ → .claude/ のマッピング定義
const mappings = [
  // 共有エージェント
  { from: '_shared/agents',       to: 'agents' },
  // 共有設定
  { from: '_shared/escalation-rules.yml', to: 'escalation-rules.yml', file: true },
  { from: '_shared/model-profiles.yml', to: 'model-profiles.yml', file: true },
  { from: '_shared/dod',          to: 'dod' },
  // ドキュメント
  { from: 'docs',                 to: 'docs' },
  // ローカルチケット雛形（プロジェクトルート tickets/ へは setup が配置。開発時は参考用に .claude 配下にも同期しない）
  // インシデントテンプレート（index.yml はプロジェクト固有のため対象外）
  { from: 'incidents/README.md',  to: 'incidents/README.md',  file: true },
  { from: 'incidents/TEMPLATE.md',to: 'incidents/TEMPLATE.md',file: true },
  // チーム定義
  { from: 'teams/backend',        to: 'teams/backend' },
  { from: 'teams/content',        to: 'teams/content' },
  { from: 'teams/frontend',       to: 'teams/frontend' },
  { from: 'teams/infra',          to: 'teams/infra' },
  { from: 'teams/sns',            to: 'teams/sns' },
  { from: 'teams/youtube',        to: 'teams/youtube' },
];

let copied = 0;
let skipped = 0;

function copyFile(src, dest) {
  const destDir = dirname(dest);
  if (!isDry) {
    mkdirSync(destDir, { recursive: true });
    copyFileSync(src, dest);
  }
  const rel = relative(projectRoot, dest);
  console.log(`  ✅ ${relative(projectRoot, src)} → ${rel}`);
  copied++;
}

function syncDir(srcDir, destDir) {
  if (!existsSync(srcDir)) return;
  const entries = readdirSync(srcDir);
  for (const entry of entries) {
    if (entry === '.gitkeep') continue;
    const srcPath = join(srcDir, entry);
    const destPath = join(destDir, entry);
    const stat = statSync(srcPath);
    if (stat.isDirectory()) {
      syncDir(srcPath, destPath);
    } else {
      copyFile(srcPath, destPath);
    }
  }
}

console.log('📦 templates/ → .claude/ を同期します\n');

for (const { from, to, file } of mappings) {
  const src = join(templatesDir, from);
  const dest = join(claudeDir, to);
  if (!existsSync(src)) {
    console.log(`  ⚠️  スキップ: templates/${from} が存在しません`);
    skipped++;
    continue;
  }
  if (file) {
    copyFile(src, dest);
  } else {
    syncDir(src, dest);
  }
}

console.log(`\n${isDry ? '🔍 ドライラン完了' : '✅ 同期完了'}: ${copied} ファイル（${skipped} スキップ）`);
if (!isDry) {
  console.log('\n💡 .claude/ はgitignore対象のため、コミットには含まれません。');
  console.log('   templates/ への変更をコミットしてください。');
}
