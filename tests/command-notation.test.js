/**
 * スラッシュコマンド表記の再発防止テスト
 *
 * 正準表記はハイフン区切り（/ai-team-setup, /ai-team-run 等）。
 * 旧スペース区切り（/ai-team setup 等）が配布物・スキル・テンプレートに
 * 混入していないことを検証する。
 * ※ docs-src/versions/ は過去バージョンのアーカイブのため対象外。
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve, join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, '..');

// 検査対象: 配布・実行に使われる「生きた」ファイル群
const TARGET_DIRS = ['bin', 'skills', 'templates', 'packages', 'tests'];
const TARGET_EXTS = ['.js', '.md', '.yml', '.yaml', '.sh', '.json'];

// 旧スペース区切り表記（例: /ai-team setup）。
// `npx @trimix/ai-team install` のような npm CLI 表記は正当なので除外する。
// 自ファイルの検出を避けるためパターンを分割して構築する。
const OLD_NOTATION = new RegExp(
  '(^|[^/@\\w])' + '/ai-team' + ' +' +
  '(setup|run|watch|resume|gallery|install|configure|create|uninstall)\\b'
);

function collectFiles(dir) {
  const result = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      result.push(...collectFiles(fullPath));
    } else if (TARGET_EXTS.some(ext => entry.endsWith(ext))) {
      result.push(fullPath);
    }
  }
  return result;
}

test('旧スペース区切りのスラッシュコマンド表記（/ai-team <sub>）が残っていない', () => {
  const selfPath = fileURLToPath(import.meta.url);
  const violations = [];

  for (const dir of TARGET_DIRS) {
    for (const file of collectFiles(join(packageRoot, dir))) {
      if (file === selfPath) continue;
      const lines = readFileSync(file, 'utf-8').split('\n');
      lines.forEach((line, i) => {
        if (OLD_NOTATION.test(line)) {
          violations.push(`${relative(packageRoot, file)}:${i + 1}: ${line.trim()}`);
        }
      });
    }
  }

  assert.deepStrictEqual(
    violations, [],
    `旧表記が見つかりました。/ai-team-<sub> のハイフン区切りに修正してください:\n${violations.join('\n')}`
  );
});
