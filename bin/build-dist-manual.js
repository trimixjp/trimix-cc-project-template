#!/usr/bin/env node
/**
 * 配布用マニュアルツリー生成スクリプト（prepack 用）。
 *
 * npm 配布物（tgz）に同梱するマニュアルを「最新バージョン1つ分のみ」に絞るため、
 * docs-src/config.json の `latest`（単一の真実の情報源）を読み、docs-src/build.js の
 * 配布ビルドモード（--single / --out）を使って git 管理外の配布専用ディレクトリ
 * （ai-team-manual-dist/）に、最新バージョン・version-switcher 無しのツリーを生成する。
 *
 * git 管理下の ai-team-manual/（全バージョンのビルド生成物）には一切書き込まない。
 *
 * 使い方:
 *   node bin/build-dist-manual.js           配布ツリーを生成（prepack）
 *   node bin/build-dist-manual.js --clean   配布ツリーを削除（postpack）
 */
import { rmSync, readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DIST_DIR = join(ROOT, 'ai-team-manual-dist');
const BUILD_SCRIPT = join(ROOT, 'docs-src', 'build.js');
const CONFIG_PATH = join(ROOT, 'docs-src', 'config.json');

// 配布ツリーを削除する（冪等）
function clean() {
  if (existsSync(DIST_DIR)) {
    rmSync(DIST_DIR, { recursive: true, force: true });
    console.log(`🧹 配布ツリーを削除しました: ${DIST_DIR}`);
  }
}

if (process.argv.includes('--clean')) {
  clean();
  process.exit(0);
}

// config.json の latest を単一の真実の情報源として読む（バージョンのハードコード禁止）
const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
const latest = config.latest;
if (!latest) {
  throw new Error('docs-src/config.json に latest が定義されていません');
}

// 生成前に既存の配布ツリーを掃除してからビルド（残骸の混入を防ぐ）
clean();

console.log(`📦 配布用マニュアルを生成します（最新バージョン ${latest} のみ）`);
execFileSync(
  process.execPath,
  [BUILD_SCRIPT, '--single', latest, '--out', DIST_DIR],
  { stdio: 'inherit' }
);

console.log(`✅ 配布用マニュアルを生成しました: ${DIST_DIR}`);
