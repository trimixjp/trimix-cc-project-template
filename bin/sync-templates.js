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

import { mkdirSync, copyFileSync, readdirSync, statSync, existsSync } from 'fs';
import { resolve, dirname, join, relative } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { isSkillFile } from './lib/skill-files.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

/**
 * 同期マッピング定義。
 *  - from: コピー元（既定は templates/ からの相対。base: 'project' 指定時は
 *    リポジトリルートからの相対）。
 *  - to: コピー先（.claude/ からの相対）。
 *  - file: 単一ファイルとしてコピーする場合 true。
 *  - filter: ディレクトリ同期時にコピーするファイル名を絞る述語（省略時は全ファイル、
 *    ただし .gitkeep は常に除外）。
 *
 * 既存エントリは from を templates/ 基準とするスキーマ。skills/ は templates/ の外に
 * あるため base: 'project' で拡張しつつ、後方互換（既存エントリの意味）は維持する。
 */
const MAPPINGS = [
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
  // スキル（templates/ の外＝リポジトリ直下 skills/）→ .claude/commands/
  // 配布判定は skill-files.js の isSkillFile に集約する（命名規則 ai-team-*.md と
  // 短縮エイリアスの両方を含み、README 等の混入は防ぐ）。
  {
    base: 'project',
    from: 'skills',
    to: 'commands',
    filter: (name) => isSkillFile(name)
  },
];

/**
 * templates/（および base 指定のソース）を .claude/ へ同期する。
 * スクリプトとしても、テストからの関数呼び出しとしても使えるように副作用を引数化する。
 *
 * @param {object} [options]
 * @param {boolean} [options.dry]          true なら実際のコピーを行わない
 * @param {string}  [options.projectRoot]  リポジトリルート（base: 'project' の基準）
 * @param {string}  [options.templatesDir] templates/ のパス
 * @param {string}  [options.claudeDir]    出力先 .claude/ のパス
 * @param {(msg?: string) => void} [options.log] 出力関数（テストで差し替え可能）
 * @returns {{ copied: number, skipped: number }}
 */
export function runSync(options = {}) {
  const {
    dry = false,
    projectRoot: pRoot = projectRoot,
    templatesDir = join(pRoot, 'templates'),
    claudeDir = join(pRoot, '.claude'),
    log = console.log,
  } = options;

  let copied = 0;
  let skipped = 0;

  function copyOne(src, dest) {
    if (!dry) {
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(src, dest);
    }
    log(`  ✅ ${relative(pRoot, src)} → ${relative(pRoot, dest)}`);
    copied++;
  }

  function syncDir(srcDir, destDir, filter) {
    if (!existsSync(srcDir)) return;
    for (const entry of readdirSync(srcDir)) {
      if (entry === '.gitkeep') continue;
      const srcPath = join(srcDir, entry);
      const destPath = join(destDir, entry);
      if (statSync(srcPath).isDirectory()) {
        syncDir(srcPath, destPath, filter);
      } else {
        if (filter && !filter(entry)) continue;
        copyOne(srcPath, destPath);
      }
    }
  }

  if (dry) log('🔍 ドライラン: 実際にはコピーしません\n');
  log('📦 templates/ → .claude/ を同期します\n');

  for (const { base, from, to, file, filter } of MAPPINGS) {
    const srcBase = base === 'project' ? pRoot : templatesDir;
    const src = join(srcBase, from);
    const dest = join(claudeDir, to);
    if (!existsSync(src)) {
      log(`  ⚠️  スキップ: ${relative(pRoot, src)} が存在しません`);
      skipped++;
      continue;
    }
    if (file) {
      copyOne(src, dest);
    } else {
      syncDir(src, dest, filter);
    }
  }

  log(`\n${dry ? '🔍 ドライラン完了' : '✅ 同期完了'}: ${copied} ファイル（${skipped} スキップ）`);
  return { copied, skipped };
}

// スクリプトとして直接実行された場合のみ CLI として動作する
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const dry = process.argv.includes('--dry');
  runSync({ dry });
  if (!dry) {
    console.log('\n💡 .claude/ はgitignore対象のため、コミットには含まれません。');
    console.log('   templates/ への変更をコミットしてください。');
  }
}
