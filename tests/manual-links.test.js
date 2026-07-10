/**
 * マニュアルのリンク切れ検出テスト
 *
 * docs-src の Markdown はビルドで HTML に変換されるため、ソース中の
 * `[text](foo.md)` をそのまま出力すると必ずリンク切れになる。
 * また相対パスを間違えると、生成 HTML から存在しないファイルを指す。
 *
 * 検査対象は `ai-team-manual/docs/` 配下の全バージョン。
 * 過去バージョンもドキュメントサイトから閲覧できるため、リンク切れを許容しない。
 *
 * 前提: `node docs-src/build.js` が実行済みであること。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, '..');

const config = JSON.parse(readFileSync(join(packageRoot, 'docs-src', 'config.json'), 'utf8'));
const docsDir = join(packageRoot, 'ai-team-manual', 'docs');
const latestDir = join(docsDir, config.latest);

/** ディレクトリ配下の .html を再帰列挙する */
function listHtml(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listHtml(full));
    else if (name.endsWith('.html')) out.push(full);
  }
  return out;
}

/** href="..." を列挙する */
function hrefs(html) {
  return [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
}

/** 外部 URL・アンカーのみのリンクは検査対象外 */
function isExternal(href) {
  return /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//') || href.startsWith('#');
}

test('最新版マニュアルがビルド済みである', () => {
  assert.ok(
    existsSync(latestDir),
    `${relative(packageRoot, latestDir)} が存在しません。node docs-src/build.js を実行してください`
  );
});

test('生成 HTML が .md へのリンクを含まない（ビルド後にリンク切れになるため）', () => {
  const offenders = [];
  for (const file of listHtml(docsDir)) {
    for (const href of hrefs(readFileSync(file, 'utf8'))) {
      if (isExternal(href)) continue;
      if (/\.md(?:$|#|\?)/i.test(href)) {
        offenders.push(`${relative(packageRoot, file)} → ${href}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `\n.md を指すリンク:\n  ${offenders.join('\n  ')}\n`);
});

test('生成 HTML の内部リンクがすべて実在するファイルを指す（全バージョン）', () => {
  const broken = [];
  for (const file of listHtml(docsDir)) {
    for (const href of hrefs(readFileSync(file, 'utf8'))) {
      if (isExternal(href)) continue;
      const target = decodeURIComponent(href.split('#')[0].split('?')[0]);
      if (!target) continue;
      if (!existsSync(resolve(dirname(file), target))) {
        broken.push(`${relative(packageRoot, file)} → ${href}`);
      }
    }
  }
  assert.deepEqual(broken, [], `\nリンク切れ:\n  ${broken.join('\n  ')}\n`);
});
